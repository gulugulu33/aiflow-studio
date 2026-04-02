import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';

@Injectable()
export class ConditionNodeExecutor implements INodeExecutor {
  async execute(node: any, context: Record<string, any>): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const { conditions } = nodeData;

    let result = true;
    if (conditions && Array.isArray(conditions)) {
      for (const condition of conditions) {
        const { variable, operator, value } = condition;
        const contextValue = this.resolveVariable(variable, context);
        if (!this.evaluate(contextValue, operator, value)) {
          result = false;
          break;
        }
      }
    }

    return { result };
  }

  private resolveVariable(template: string, context: Record<string, any>): any {
    if (!template) return undefined;
    const keys = template.replace(/\{\{|\}\}/g, '').trim().split('.');
    let value = context;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    return value;
  }

  private evaluate(contextValue: any, operator: string, value: any): boolean {
    switch (operator) {
      case '===':
        return contextValue === value;
      case '!==':
        return contextValue !== value;
      case '>':
        return contextValue > value;
      case '<':
        return contextValue < value;
      case '>=':
        return contextValue >= value;
      case '<=':
        return contextValue <= value;
      case 'contains':
        return typeof contextValue === 'string' && contextValue.includes(value);
      default:
        return false;
    }
  }
}
