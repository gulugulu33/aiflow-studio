import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { NodeExecutorFactory } from './node-executor.factory';
import { RunWorkflowDto } from '../dto/run-workflow.dto';
import { Subject } from 'rxjs';

@Injectable()
export class WorkflowExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: NodeExecutorFactory,
  ) {}

  async executeWorkflow(workflowId: string, runDto: RunWorkflowDto, sseSubject?: Subject<any>) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

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

    // Track remaining in-degree for runtime (some edges may be "pruned" by conditions)
    const runtimeInDegree = new Map<string, number>(inDegree);

    // Seed queue with root nodes (in-degree = 0)
    const queue: string[] = nodes
      .filter((n) => inDegree.get(n.id) === 0)
      .map((n) => n.id);

    while (queue.length > 0) {
      const nodeId = queue.shift()!;

      // Skip if already executed or skipped
      if (executed.has(nodeId) || skipped.has(nodeId)) continue;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const executor = this.factory.getExecutor(node.type);

      try {
        sseSubject?.next({ type: 'node_status', data: { nodeId, status: 'running' } });
        const output = await executor.execute(node, context);
        context[nodeId] = output;
        executed.add(nodeId);
        sseSubject?.next({ type: 'node_status', data: { nodeId, status: 'success', output } });

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
        sseSubject?.next({ type: 'node_status', data: { nodeId, status: 'failed', error: error.message } });
        sseSubject?.next({ type: 'error', data: { message: `Error executing node ${nodeId}: ${error.message}` } });
        throw error;
      }
    }

    sseSubject?.next({ type: 'done', data: { finalContext: context } });
    return context;
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
