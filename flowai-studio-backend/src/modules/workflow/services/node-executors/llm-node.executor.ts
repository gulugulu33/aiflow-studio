import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';
import { AiService } from '../../../ai/ai.service';

@Injectable()
export class LLMNodeExecutor implements INodeExecutor {
  constructor(private readonly aiService: AiService) {}

  async execute(node: any, context: Record<string, any>): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const { model, systemPrompt, userPrompt, temperature, maxTokens } = nodeData;

    // 替换上下文变量
    const resolvedUserPrompt = this.resolveVariables(userPrompt, context);

    const response = await this.aiService.chatWithLLM(
      resolvedUserPrompt,
      systemPrompt,
      [], // 暂不支持多轮对话历史
      model,
      temperature,
      maxTokens,
    );

    return { result: response };
  }

  private resolveVariables(template: string, context: Record<string, any>): string {
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
