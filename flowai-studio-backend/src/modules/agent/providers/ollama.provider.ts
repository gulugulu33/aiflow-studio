/**
 * Ollama 本地 LLM Provider
 *
 * 支持:
 * - 所有 Ollama 兼容模型（Llama 3 / Mistral / Qwen2 / DeepSeek Coder 等）
 * - Function Calling（部分模型支持，如 Qwen2、Command R）
 * - 流式输出
 * - 零 API 成本，数据不离开服务器
 *
 * 竞品对标:
 * - Dify: 支持 Ollama + Xinference + LocalAI + LM Studio
 * - Flowise: 支持 Ollama + LocalAI
 * - n8n: 支持 Ollama
 * - 本设计: Ollama 兼容 OpenAI 格式，自动发现本地模型
 */
import axios from 'axios';
import {
  LLMChatParams,
  LLMResponse,
  LLMModelInfo,
  LLMProviderConfig,
} from '../interfaces/llm-provider.interface';
import { BaseLLMProvider } from './base-llm.provider';

/** Ollama 预定义模型（用户可自定义更多） */
const OLLAMA_MODELS: LLMModelInfo[] = [
  {
    id: 'qwen2.5:7b',
    displayName: 'Qwen2.5 7B (本地)',
    provider: 'ollama',
    capabilities: { functionCalling: true, vision: false, streaming: true, jsonMode: true, maxContextTokens: 32768, maxOutputTokens: 4096 },
    isDefault: true,
    order: 1,
  },
  {
    id: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B (本地)',
    provider: 'ollama',
    capabilities: { functionCalling: false, vision: false, streaming: true, jsonMode: true, maxContextTokens: 32768, maxOutputTokens: 4096 },
    order: 2,
  },
  {
    id: 'mistral:7b',
    displayName: 'Mistral 7B (本地)',
    provider: 'ollama',
    capabilities: { functionCalling: true, vision: false, streaming: true, jsonMode: true, maxContextTokens: 32768, maxOutputTokens: 4096 },
    order: 3,
  },
  {
    id: 'deepseek-coder-v2:16b',
    displayName: 'DeepSeek Coder V2 16B (本地)',
    provider: 'ollama',
    capabilities: { functionCalling: false, vision: false, streaming: true, jsonMode: true, maxContextTokens: 32768, maxOutputTokens: 4096 },
    order: 4,
  },
];

export class OllamaProvider extends BaseLLMProvider {
  private readonly baseUrl: string;
  private cachedModels: LLMModelInfo[] | null = null;

  constructor(config: LLMProviderConfig) {
    super('ollama', 'qwen2.5:7b', OLLAMA_MODELS, config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }


  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const model = params.model || this.defaultModel;

    // Ollama 兼容 OpenAI 格式
    const body = this.buildRequestBody(params);

    if (params.tools && params.tools.length > 0) {
      body.tools = this.buildToolsPayload(params.tools);
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/chat/completions`,
        body,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.config.timeout || 120000, // 本地推理可能更慢
        },
      );

      const choice = response.data.choices[0];
      const result: LLMResponse = {
        content: choice.message.content || '',
        finishReason: choice.finish_reason,
        model,
      };

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        result.toolCalls = this.parseToolCalls(choice.message.tool_calls);
      }

      result.usage = this.parseUsage(response.data.usage);
      return result;
    } catch (error) {
      this.logger.error(`Ollama API call failed: ${error.response?.data || error.message}`);
      throw new Error(`Ollama API call failed: ${error.message}`);
    }
  }

  async *chatStream(params: Omit<LLMChatParams, 'tools' | 'jsonMode'>): AsyncIterable<string> {
    const body = this.buildRequestBody(params);
    body.stream = true;

    const response = await axios.post(
      `${this.baseUrl}/v1/chat/completions`,
      body,
      {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
        timeout: this.config.timeout || 120000,
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
      const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 动态发现本地已安装的 Ollama 模型
   * 调用 /api/tags 获取模型列表
   */
  async discoverLocalModels(): Promise<LLMModelInfo[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      const models: LLMModelInfo[] = (response.data.models || []).map(
        (m: any, index: number) => ({
          id: m.name,
          displayName: `${m.name} (本地)`,
          provider: 'ollama' as const,
          capabilities: {
            functionCalling: this.detectFunctionCallingCapability(m.name),
            vision: m.name.includes('vision') || m.name.includes('vl'),
            streaming: true,
            jsonMode: true,
            maxContextTokens: 32768,
            maxOutputTokens: 4096,
          },
          order: index + 10, // 动态模型排在预定义之后
        }),
      );

      // 合并预定义和动态发现的模型
      const existingIds = new Set(models.map((m) => m.id));
      const predefined = OLLAMA_MODELS.filter((m) => !existingIds.has(m.id));
      this.cachedModels = [...OLLAMA_MODELS.map((m) => existingIds.has(m.id) ? models.find((d) => d.id === m.id) || m : m), ...models.filter((m) => !OLLAMA_MODELS.some((p) => p.id === m.id))];

      return this.cachedModels;
    } catch {
      this.logger.warn('Failed to discover Ollama models, using predefined list');
      return OLLAMA_MODELS;
    }
  }

  /**
   * 检测模型是否支持 Function Calling
   * 基于已知模型名称推断
   */
  private detectFunctionCallingCapability(modelName: string): boolean {
    const fcModels = ['qwen2', 'qwen2.5', 'mistral', 'command-r', 'mixtral'];
    return fcModels.some((m) => modelName.toLowerCase().includes(m));
  }
}
