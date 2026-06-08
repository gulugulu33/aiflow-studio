import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { NodeExecutorFactory } from './node-executor.factory';
import { RunWorkflowDto, ExecutionControlDto } from '../dto/run-workflow.dto';
import { Subject } from 'rxjs';
import {
  withTimeout,
  retryWithBackoff,
  HeartbeatManager,
  TimeoutError,
  CancelledError,
} from '../utils/execution-control.util';

/** 执行控制默认值 */
const DEFAULT_CONTROL: Required<ExecutionControlDto> = {
  workflowTimeoutMs: 300000, // 5 分钟
  nodeTimeoutMs: 60000, // 1 分钟
  heartbeatIntervalMs: 15000, // 15 秒
  maxRetries: 0,
  continueOnError: false,
};

@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  /** 正在运行的工作流取消标记 */
  private readonly cancelTokens = new Map<string, { cancelled: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: NodeExecutorFactory,
  ) {}

  async executeWorkflow(
    workflowId: string,
    runDto: RunWorkflowDto,
    sseSubject?: Subject<any>,
    executionId?: string,
  ) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // 合并执行控制配置
    const control: Required<ExecutionControlDto> = {
      ...DEFAULT_CONTROL,
      ...(runDto.control || {}),
    };

    // 注册取消标记
    const execId = executionId || `${workflowId}_${Date.now()}`;
    const cancelToken = { cancelled: false };
    this.cancelTokens.set(execId, cancelToken);

    const nodes = JSON.parse(workflow.nodes) as any[];
    const edges = JSON.parse(workflow.edges) as any[];

    // Build adjacency: nodeId → [{target, sourceHandle}]
    const adjList = new Map<string, { target: string; sourceHandle?: string }[]>();
    // Build in-degree map (only non-condition-dependent)
    const inDegree = new Map<string, number>();

    for (const node of nodes) {
      adjList.set(node.id, []);
      inDegree.set(node.id, 0);
    }

    for (const edge of edges) {
      const neighbors = adjList.get(edge.source);
      if (neighbors) {
        neighbors.push({ target: edge.target, sourceHandle: edge.sourceHandle });
      }
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // BFS-style execution: start from nodes with in-degree 0
    const context: Record<string, any> = { ...runDto.inputs };
    const executed = new Set<string>();
    const skipped = new Set<string>();
    const failed = new Set<string>();
    let currentNodeId: string | undefined;

    // Track remaining in-degree for runtime (some edges may be "pruned" by conditions)
    const runtimeInDegree = new Map<string, number>(inDegree);

    // Seed queue with root nodes (in-degree = 0)
    const queue: string[] = nodes
      .filter((n) => inDegree.get(n.id) === 0)
      .map((n) => n.id);

    // 启动心跳保活管理器
    const heartbeat = new HeartbeatManager(sseSubject, control.heartbeatIntervalMs);
    heartbeat.start(() => ({
      executed: executed.size,
      total: nodes.length,
      currentNode: currentNodeId,
    }));

    // 推送开始事件（含执行控制配置）
    sseSubject?.next({
      type: 'workflow_start',
      data: {
        executionId: execId,
        totalNodes: nodes.length,
        control,
      },
    });

    // 整体工作流执行逻辑
    const runLoop = async () => {
      while (queue.length > 0) {
        // 检查取消
        if (cancelToken.cancelled) {
          throw new CancelledError('Workflow execution was cancelled');
        }

        const nodeId = queue.shift()!;

        // Skip if already executed or skipped
        if (executed.has(nodeId) || skipped.has(nodeId) || failed.has(nodeId)) continue;

        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        currentNodeId = nodeId;
        const executor = this.factory.getExecutor(node.type);

        try {
          sseSubject?.next({
            type: 'node_status',
            data: {
              nodeId,
              status: 'running',
              progress: {
                executed: executed.size,
                total: nodes.length,
              },
            },
          });

          const nodeStartTime = Date.now();

          // 节点执行：超时控制 + 重试
          const output = await retryWithBackoff(
            () =>
              withTimeout(
                executor.execute(node, context),
                control.nodeTimeoutMs,
                'node',
                nodeId,
              ),
            {
              maxRetries: control.maxRetries,
              onRetry: (attempt, error, delayMs) => {
                this.logger.warn(
                  `Node ${nodeId} failed (attempt ${attempt}), retrying in ${delayMs}ms: ${error.message}`,
                );
                sseSubject?.next({
                  type: 'node_status',
                  data: {
                    nodeId,
                    status: 'retrying',
                    attempt,
                    delayMs,
                    error: error.message,
                  },
                });
              },
            },
          );

          const nodeDuration = Date.now() - nodeStartTime;

          context[nodeId] = output;
          executed.add(nodeId);

          sseSubject?.next({
            type: 'node_status',
            data: {
              nodeId,
              status: 'success',
              output,
              durationMs: nodeDuration,
              progress: {
                executed: executed.size,
                total: nodes.length,
              },
            },
          });

          // Get downstream edges
          const downstream = adjList.get(nodeId) || [];

          if (node.type === 'condition') {
            // Condition node: only activate the matching branch
            const conditionResult = output?.result;
            const matchHandle = conditionResult ? 'true' : 'false';
            const skipHandle = conditionResult ? 'false' : 'true';

            for (const edge of downstream) {
              if (edge.sourceHandle === matchHandle) {
                // Decrement in-degree for the active branch target
                const deg = (runtimeInDegree.get(edge.target) || 1) - 1;
                runtimeInDegree.set(edge.target, deg);
                if (deg <= 0) {
                  queue.push(edge.target);
                }
              } else if (edge.sourceHandle === skipHandle) {
                // Mark skipped branch — recursively skip all descendants
                this.skipBranch(edge.target, adjList, skipped, sseSubject);
              }
            }
          } else {
            // Normal node: activate all downstream
            for (const edge of downstream) {
              const deg = (runtimeInDegree.get(edge.target) || 1) - 1;
              runtimeInDegree.set(edge.target, deg);
              if (deg <= 0 && !skipped.has(edge.target)) {
                queue.push(edge.target);
              }
            }
          }
        } catch (error) {
          const isTimeout = error instanceof TimeoutError;
          const isCancelled = error instanceof CancelledError;

          failed.add(nodeId);

          sseSubject?.next({
            type: 'node_status',
            data: {
              nodeId,
              status: isTimeout ? 'timeout' : 'failed',
              error: error.message,
            },
          });

          // 取消错误直接抛出，不受 continueOnError 影响
          if (isCancelled) {
            throw error;
          }

          // continueOnError 模式：跳过当前节点的下游分支，继续执行其他分支
          if (control.continueOnError) {
            this.logger.warn(
              `Node ${nodeId} failed but continueOnError is enabled, skipping downstream: ${error.message}`,
            );
            const downstream = adjList.get(nodeId) || [];
            for (const edge of downstream) {
              this.skipBranch(edge.target, adjList, skipped, sseSubject);
            }
            continue;
          }

          // 默认行为：失败即中断
          sseSubject?.next({
            type: 'error',
            data: {
              message: `Error executing node ${nodeId}: ${error.message}`,
              nodeId,
              isTimeout,
            },
          });
          throw error;
        }
      }
    };

    try {
      // 工作流整体超时控制
      await withTimeout(runLoop(), control.workflowTimeoutMs, 'workflow', workflow.name);

      sseSubject?.next({
        type: 'done',
        data: {
          finalContext: context,
          stats: {
            executed: executed.size,
            skipped: skipped.size,
            failed: failed.size,
            total: nodes.length,
            durationMs: heartbeat.getElapsedMs(),
          },
        },
      });

      return context;
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      const isCancelled = error instanceof CancelledError;

      sseSubject?.next({
        type: 'error',
        data: {
          message: error.message,
          isTimeout,
          isCancelled,
          scope: isTimeout ? (error as TimeoutError).scope : undefined,
          stats: {
            executed: executed.size,
            skipped: skipped.size,
            failed: failed.size,
            total: nodes.length,
            durationMs: heartbeat.getElapsedMs(),
          },
        },
      });

      throw error;
    } finally {
      heartbeat.stop();
      this.cancelTokens.delete(execId);
    }
  }

  /**
   * 取消正在运行的工作流
   *
   * @param executionId 执行 ID
   * @returns 是否成功标记取消
   */
  cancelExecution(executionId: string): boolean {
    const token = this.cancelTokens.get(executionId);
    if (token) {
      token.cancelled = true;
      this.logger.log(`Workflow execution ${executionId} marked for cancellation`);
      return true;
    }
    return false;
  }

  /**
   * 获取正在运行的执行 ID 列表
   */
  getRunningExecutions(): string[] {
    return Array.from(this.cancelTokens.keys());
  }

  /**
   * Recursively mark a branch as skipped and notify via SSE
   */
  private skipBranch(
    nodeId: string,
    adjList: Map<string, { target: string; sourceHandle?: string }[]>,
    skipped: Set<string>,
    sseSubject?: Subject<any>,
  ) {
    if (skipped.has(nodeId)) return;
    skipped.add(nodeId);
    sseSubject?.next({ type: 'node_status', data: { nodeId, status: 'skipped' } });

    const downstream = adjList.get(nodeId) || [];
    for (const edge of downstream) {
      this.skipBranch(edge.target, adjList, skipped, sseSubject);
    }
  }
}
