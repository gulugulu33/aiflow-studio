import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { TopologicalSorter } from '../utils/topological-sorter';
import { NodeExecutorFactory } from './node-executor.factory';
import { RunWorkflowDto } from '../dto/run-workflow.dto';
import { Workflow } from '@prisma/client';
import { Subject } from 'rxjs';

@Injectable()
export class WorkflowExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sorter: TopologicalSorter,
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

    const sortedNodeIds = this.sorter.sort(nodes, edges);
    const context: Record<string, any> = { ...runDto.inputs };

    for (const nodeId of sortedNodeIds) {
      const node = nodes.find((n) => n.id === nodeId);
      const executor = this.factory.getExecutor(node.type);

      try {
        sseSubject?.next({ type: 'node_status', data: { nodeId, status: 'running' } });
        const output = await executor.execute(node, context);
        context[nodeId] = output;
        sseSubject?.next({ type: 'node_status', data: { nodeId, status: 'success', output } });
      } catch (error) {
        sseSubject?.next({ type: 'node_status', data: { nodeId, status: 'failed', error: error.message } });
        sseSubject?.next({ type: 'error', data: { message: `Error executing node ${nodeId}: ${error.message}` } });
        throw error;
      }
    }

    sseSubject?.next({ type: 'done', data: { finalContext: context } });
    return context;
  }
}
