/**
 * OpenAI LLM Provider
 *
 * 支持:
 * - GPT-4o / GPT-4o-mini / GPT-4 Turbo / GPT-3.5 Turbo
 * - Function Calling
 * - Vision (GPT-4o 系列)
 * - JSON Mode
 * - 流式输出
 * - Azure OpenAI 兼容
 *
 * 竞品对标:
 * - Dify: 支持 Azure OpenAI + 自定义 Endpoint
 * - n8n: 支持 OpenAI + Azure
 * - 本设计: 同时支持标准 OpenAI + Azure OpenAI 端点
 */
import axios from 'axios';
import {
  LLMChatParams,
  LLMResponse,
  LLMModelInfo,
  LLMProviderConfig,
} from '../interfaces/llm-provider.interface';
import { BaseLLMProvider } from './base-llm.provider';

/** OpenAI 支持的模型列表 */
const OPENAI_MODELS: LLMModelInfo[] = [
  {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: true, maxContextTokens: 128000, maxOutputTokens: 16384 },
    inputPricePer1M: 2.5,
    outputPricePer1M: 10,
    isDefault: true,
    order: 1,
  },
  {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: true, maxContextTokens: 128000, maxOutputTokens: 16384 },
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    order: 2,
  },
  {
    id: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    provider: 'openai',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: true, maxContextTokens: 128000, maxOutputTokens: 4096 },
    inputPricePer1M: 10,
    outputPricePer1M: 30,
    order: 3,
  },
  {
    id: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    provider: 'openai',
    capabilities: { functionCalling: true, vision: false, streaming: true, jsonMode: true, maxContextTokens: 16385, maxOutputTokens: 4096 },
    inputPricePer1M: 0.5,
    outputPricePer1M: 1.5,
    order: 4,
  },
];

export class OpenAIProvider extends BaseLLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly organization?: string;

  constructor(config: LLMProviderConfig) {
    super(
      'openai',
      'gpt-4o',
      OPENAI_MODELS,
      config,
    );
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.organization = config.extra?.organization;
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const body = this.buildRequestBody(params);

    // 工具调用
    if (params.tools && params.tools.length > 0) {
      body.tools = this.buildToolsPayload(params.tools);
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      };
      if (this.organization) {
        headers['OpenAI-Organization'] = this.organization;
      }

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        body,
        { headers, timeout: this.config.timeout || 60000 },
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
      this.logger.error(`OpenAI API call failed: ${error.response?.data?.error?.message || error.message}`);
      throw new Error(`OpenAI API call failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async *chatStream(params: Omit<LLMChatParams, 'tools' | 'jsonMode'>): AsyncIterable<string> {
    const body = this.buildRequestBody({ ...params, model: params.model });
    body.stream = true;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      body,
      { headers, responseType: 'stream', timeout: this.config.timeout || 60000 },
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
      await axios.get(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }
}
