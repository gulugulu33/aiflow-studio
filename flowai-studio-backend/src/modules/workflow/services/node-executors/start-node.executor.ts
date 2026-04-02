import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';

@Injectable()
export class StartNodeExecutor implements INodeExecutor {
  async execute(node: any, context: Record<string, any>): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const output: Record<string, any> = {};
    if (nodeData.variables && Array.isArray(nodeData.variables)) {
      for (const variable of nodeData.variables) {
        output[variable.key] = variable.value;
      }
    }
    return output;
  }
}
