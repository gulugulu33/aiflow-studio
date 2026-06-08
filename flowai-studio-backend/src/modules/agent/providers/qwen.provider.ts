/**
 * Qwen (通义千问 / DashScope) LLM Provider
 *
 * 支持:
 * - Qwen-Turbo / Qwen-Plus / Qwen-Max / Qwen-Long
 * - Function Calling（兼容 OpenAI 格式）
 * - 流式输出
 * - 长上下文
 *
 * 竞品对标:
 * - Dify: 支持通义千问全系列
 * - Coze: 仅支持豆包
 * - 本设计: Qwen 全系列 + DashScope 兼容 OpenAI 格式
 */
import axios from 'axios';
import {
  LLMChatParams,
  LLMResponse,
  LLMModelInfo,
  LLMProviderConfig,
} from '../interfaces/llm-provider.interface';
import { BaseLLMProvider } from './base-llm.provider';

/** Qwen 支持的模型列表 */
const QWEN_MODELS: LLMModelInfo[] = [
  {
    id: 'qwen-turbo',
    displayName: 'Qwen Turbo (快速)',
    provider: 'qwen',
    capabilities: { functionCalling: true, vision: false, streaming: true, jsonMode: true, maxContextTokens: 131072, maxOutputTokens: 8192 },
    inputPricePer1M: 0.3,
    outputPricePer1M: 0.6,
    isDefault: true,
    order: 1,
  },
  {
    id: 'qwen-plus',
    displayName: 'Qwen Plus (高质量)',
    provider: 'qwen',
    capabilities: { functionCalling: true, vision: false, streaming: true, jsonMode: true, maxContextTokens: 131072, maxOutputTokens: 8192 },
    inputPricePer1M: 0.8,
    outputPricePer1M: 2,
    order: 2,
  },
  {
    id: 'qwen-max',
    displayName: 'Qwen Max (最强)',
    provider: 'qwen',
    capabilities: { functionCalling: true, vision: false, streaming: true, jsonMode: true, maxContextTokens: 32768, maxOutputTokens: 8192 },
    inputPricePer1M: 2.4,
    outputPricePer1M: 9.6,
    order: 3,
  },
  {
    id: 'qwen-long',
    displayName: 'Qwen Long (长文本)',
    provider: 'qwen',
    capabilities: { functionCalling: false, vision: false, streaming: true, jsonMode: false, maxContextTokens: 1048576, maxOutputTokens: 6000 },
    inputPricePer1M: 0.5,
    outputPricePer1M: 2,
    order: 4,
  },
  {
    id: 'qwen-vl-plus',
    displayName: 'Qwen VL Plus (视觉)',
    provider: 'qwen',
    capabilities: { functionCalling: false, vision: true, streaming: true, jsonMode: false, maxContextTokens: 32768, maxOutputTokens: 8192 },
    inputPricePer1M: 1.2,
    outputPricePer1M: 1.2,
    order: 5,
  },
];

export class QwenProvider extends BaseLLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: LLMProviderConfig) {
    super('qwen', 'qwen-turbo', QWEN_MODELS, config);
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const body = this.buildRequestBody(params);

    // 工具调用
    if (params.tools && params.tools.length > 0) {
      body.tools = this.buildToolsPayload(params.tools);
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        body,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.config.timeout || 60000,
        },
      );

      const choice = response.data.choices[0];
      const result: LLMResponse = {
        content: choice.message.content || '',
        finishReason: choice.finish_reason,
        model: response.data.model,
      };

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        result.toolCalls = this.parseToolCalls(choice.message.tool_calls);
      }

      result.usage = this.parseUsage(response.data.usage);
      return result;
    } catch (error) {
      this.logger.error(`Qwen API call failed: ${error.response?.data || error.message}`);
      throw new Error(`Qwen API call failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async *chatStream(params: Omit<LLMChatParams, 'tools' | 'jsonMode'>): AsyncIterable<string> {
    const body = this.buildRequestBody(params);
    body.stream = true;

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: this.config.timeout || 60000,
      },
    );

    let buffer = '';
    for await (const chunk of response.data) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          const content = data.choices[0]?.delta?.content || '';
          if (content) yield content;
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Qwen 使用 DashScope 兼容 OpenAI 格式，尝试简单请求
      await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.defaultModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return true;
    } catch (error) {
      // 429 = rate limited but key valid
      return error.response?.status === 429;
    }
  }
}
