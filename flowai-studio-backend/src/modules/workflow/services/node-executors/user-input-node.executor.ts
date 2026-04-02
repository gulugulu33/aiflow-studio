import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';

@Injectable()
export class UserInputNodeExecutor implements INodeExecutor {
  async execute(node: any, context: Record<string, any>): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const { inputField } = nodeData;

    // 用户输入通常在工作流启动时作为初始上下文传入
    // 这里我们假设 context 中已经包含了用户输入的值
    const inputValue = context[inputField];

    if (inputValue === undefined) {
      throw new Error(`Missing required user input for field: ${inputField}`);
    }

    return { [inputField]: inputValue };
  }
}
