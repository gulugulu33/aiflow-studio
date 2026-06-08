/**
 * Google Gemini LLM Provider
 *
 * 支持:
 * - Gemini 1.5 Pro / Flash / 1.0 Pro
 * - Function Calling
 * - Vision
 * - 流式输出
 *
 * 竞品对标:
 * - Dify: 支持 Gemini Pro
 * - n8n: 支持 Gemini Pro
 * - 本设计: 支持 Gemini 1.5 全系列，长上下文 100 万 tokens
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

/** Gemini 支持的模型列表 */
const GEMINI_MODELS: LLMModelInfo[] = [
  {
    id: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'gemini',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: true, maxContextTokens: 1048576, maxOutputTokens: 8192 },
    inputPricePer1M: 1.25,
    outputPricePer1M: 5,
    isDefault: true,
    order: 1,
  },
  {
    id: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    provider: 'gemini',
    capabilities: { functionCalling: true, vision: true, streaming: true, jsonMode: true, maxContextTokens: 1048576, maxOutputTokens: 8192 },
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    order: 2,
  },
  {
    id: 'gemini-1.0-pro',
    displayName: 'Gemini 1.0 Pro',
    provider: 'gemini',
    capabilities: { functionCalling: true, vision: false, streaming: true, jsonMode: true, maxContextTokens: 32768, maxOutputTokens: 8192 },
    inputPricePer1M: 0.5,
    outputPricePer1M: 1.5,
    order: 3,
  },
];

export class GeminiProvider extends BaseLLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: LLMProviderConfig) {
    super('gemini', 'gemini-1.5-pro', GEMINI_MODELS, config);
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const model = params.model || this.defaultModel;

    const body = this.buildGeminiRequest(params);

    try {
      const url = params.tools && params.tools.length > 0
        ? `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`
        : `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

      const response = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: this.config.timeout || 60000,
      });

      return this.parseGeminiResponse(response.data, model);
    } catch (error) {
      this.logger.error(`Gemini API call failed: ${error.response?.data?.error?.message || error.message}`);
      throw new Error(`Gemini API call failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async *chatStream(params: Omit<LLMChatParams, 'tools' | 'jsonMode'>): AsyncIterable<string> {
    const model = params.model || this.defaultModel;

    const body = this.buildGeminiRequest(params);
    delete body.tools; // 流式暂不支持工具调用

    const response = await axios.post(
      `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      body,
      {
        headers: { 'Content-Type': 'application/json' },
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
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (content) yield content;
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await axios.get(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        { timeout: 5000 },
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 构建 Gemini API 请求体
   */
  private buildGeminiRequest(params: LLMChatParams): Record<string, any> {
    const contents = this.convertMessagesToGemini(params.messages);

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 2048,
      },
    };

    // 系统指令
    const systemMsg = params.messages.find((m) => m.role === 'system');
    if (systemMsg) {
      body.systemInstruction = {
        parts: [{ text: systemMsg.content }],
      };
    }

    // JSON Mode
    if (params.jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    // 工具调用
    if (params.tools && params.tools.length > 0) {
      body.tools = [{
        functionDeclarations: params.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      }];
    }

    return body;
  }

  /**
   * 转换消息格式：OpenAI → Gemini
   */
  private convertMessagesToGemini(messages: Array<{ role: string; content: string }>): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // 系统消息单独处理

      const role = (msg.role === 'assistant' || msg.role === 'supervisor') ? 'model' : 'user';

      if (msg.role === 'tool') {
        // 工具结果转为 functionCall 的 functionResponse
        contents.push({
          role: 'function',
          parts: [{ text: msg.content }],
        });
      } else {
        contents.push({
          role,
          parts: [{ text: msg.content }],
        });
      }
    }

    return contents;
  }

  /**
   * 解析 Gemini 响应
   */
  private parseGeminiResponse(data: any, model: string): LLMResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      return { content: '', model };
    }

    const result: LLMResponse = {
      content: '',
      model,
      finishReason: candidate.finishReason?.toLowerCase(),
    };

    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content?.parts || []) {
      if (part.text) {
        result.content += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }

    if (data.usageMetadata) {
      result.usage = {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      };
    }

    return result;
  }
}
