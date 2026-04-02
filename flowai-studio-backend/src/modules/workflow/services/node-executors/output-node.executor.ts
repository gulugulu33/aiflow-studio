import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';

@Injectable()
export class OutputNodeExecutor implements INodeExecutor {
  async execute(node: any, context: Record<string, any>): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const { outputValue } = nodeData;

    const resolvedOutput = this.resolveVariables(outputValue, context);

    return { finalOutput: resolvedOutput };
  }

  private resolveVariables(template: any, context: Record<string, any>): any {
    if (typeof template !== 'string') {
      return template;
    }
    return template.replace(/\{\{(.+?)\}\}/g, (match, p1) => {
      const keys = p1.trim().split('.');
      let value = context;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return match;
        }
      }
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }
}
