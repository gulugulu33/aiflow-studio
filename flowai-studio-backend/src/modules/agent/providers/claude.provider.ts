/**
 * Claude (Anthropic) LLM Provider
 *
 * 支持:
 * - Claude 3.5 Sonnet / Claude 3 Opus / Claude 3 Haiku
 * - Tool Use (Anthropic 特有格式，转换为统一接口)
 * - Vision
 * - 流式输出
 *
 * 竞品对标:
 * - Dify: 支持 Claude 全系列
 * - n8n: 支持 Claude 3 系列
 * - 本设计: 适配 Anthropic Messages API，统一转换 Function Calling 格式
 */
import axios from 'axios';
import {
  LLMChatParams,
  LLMResponse,
  LLMModelInfo,
  LLMProviderConfig,
  ToolDefinition,
  ToolCall,
} from '../interfaces/llm-provider.interface';
import { BaseLLMProvider } from './base-llm.provider';

/** Claude 支持的模型列表 */
const CLAUDE_MODELS: LLMModelInfo[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    provider: 'claude',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: false, maxContextTokens: 200000, maxOutputTokens: 8192 },
    inputPricePer1M: 3,
    outputPricePer1M: 15,
    isDefault: true,
    order: 1,
  },
  {
    id: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    provider: 'claude',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: false, maxContextTokens: 200000, maxOutputTokens: 4096 },
    inputPricePer1M: 15,
    outputPricePer1M: 75,
    order: 2,
  },
  {
    id: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    provider: 'claude',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: false, maxContextTokens: 200000, maxOutputTokens: 4096 },
    inputPricePer1M: 0.25,
    outputPricePer1M: 1.25,
    order: 3,
  },
];

export class ClaudeProvider extends BaseLLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly anthropicVersion: string;

  constructor(config: LLMProviderConfig) {
    super('claude', 'claude-3-5-sonnet-20241022', CLAUDE_MODELS, config);
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
    this.anthropicVersion = config.extra?.anthropicVersion || '2023-06-01';
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const model = params.model || this.defaultModel;
    const modelInfo = this.getModelInfo(model);

    // Anthropic Messages API 格式转换
    const { system, messages } = this.convertMessages(params.messages);

    const body: Record<string, any> = {
      model,
      max_tokens: params.maxTokens ?? modelInfo?.capabilities.maxOutputTokens ?? 4096,
      messages,
    };

    if (system) {
      body.system = system;
    }

    // Tool Use (Anthropic 格式)
    if (params.tools && params.tools.length > 0) {
      body.tools = this.convertToolsToAnthropicFormat(params.tools);
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/messages`,
        body,
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': this.anthropicVersion,
            'Content-Type': 'application/json',
          },
          timeout: this.config.timeout || 60000,
        },
      );

      return this.parseAnthropicResponse(response.data);
    } catch (error) {
      this.logger.error(`Claude API call failed: ${error.response?.data?.error?.message || error.message}`);
      throw new Error(`Claude API call failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async *chatStream(params: Omit<LLMChatParams, 'tools' | 'jsonMode'>): AsyncIterable<string> {
    const model = params.model || this.defaultModel;
    const { system, messages } = this.convertMessages(params.messages);

    const body: Record<string, any> = {
      model,
      max_tokens: params.maxTokens ?? 4096,
      messages,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    const response = await axios.post(
      `${this.baseUrl}/v1/messages`,
      body,
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': this.anthropicVersion,
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
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
            yield data.delta.text;
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Anthropic 无 /models 端点，发送最小请求验证
      await axios.post(
        `${this.baseUrl}/v1/messages`,
        { model: this.defaultModel, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': this.anthropicVersion,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return true;
    } catch (error) {
      // 401 = key invalid, 429 = rate limited but key valid
      return error.response?.status === 429;
    }
  }

  /**
   * 转换消息格式：OpenAI → Anthropic
   * Anthropic 要求 system 消息单独传递，不支持 role=tool
   */
  private convertMessages(messages: Array<{ role: string; content: string }>): {
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string | Array<any> }>;
  } {
    let system = '';
    const converted: Array<{ role: 'user' | 'assistant'; content: string | Array<any> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system += (system ? '\n\n' : '') + msg.content;
      } else if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'supervisor') {
        converted.push({
          role: msg.role === 'supervisor' ? 'assistant' : (msg.role as 'user' | 'assistant'),
          content: msg.content,
        });
      } else if (msg.role === 'tool') {
        // Anthropic 使用 tool_result 格式，这里简化为 user 消息
        converted.push({
          role: 'user',
          content: `[Tool Result]: ${msg.content}`,
        });
      }
    }

    return { system, messages: converted };
  }

  /**
   * 转换工具定义：OpenAI Function Calling → Anthropic Tool Use
   */
  private convertToolsToAnthropicFormat(tools: ToolDefinition[]): any[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  /**
   * 解析 Anthropic 响应
   */
  private parseAnthropicResponse(data: any): LLMResponse {
    const result: LLMResponse = {
      content: '',
      model: data.model,
    };

    const toolCalls: ToolCall[] = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        result.content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input || {},
        });
      }
    }

    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }

    result.finishReason = data.stop_reason === 'end_turn' ? 'stop'
      : data.stop_reason === 'tool_use' ? 'tool_calls'
      : data.stop_reason;

    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      };
    }

    return result;
  }
}
