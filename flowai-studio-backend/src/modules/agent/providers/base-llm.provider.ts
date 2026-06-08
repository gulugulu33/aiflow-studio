/**
 * LLM Provider 基础抽象类
 *
 * 提供所有 Provider 共享的基础逻辑:
 * - 工具定义构建（OpenAI Function Calling 格式）
 * - Token 估算（粗略）
 * - 消息格式化
 * - 错误处理
 */
import { Logger } from '@nestjs/common';
import {
  ILLMProvider,
  LLMProviderType,
  LLMModelInfo,
  LLMChatParams,
  LLMResponse,
  ToolDefinition,
} from '../interfaces/llm-provider.interface';

export abstract class BaseLLMProvider implements ILLMProvider {
  protected readonly logger: Logger;

  constructor(
    public readonly name: LLMProviderType,
    public readonly defaultModel: string,
    public readonly supportedModels: LLMModelInfo[],
    protected readonly config: { apiKey?: string; baseUrl?: string; timeout?: number },
  ) {
    this.logger = new Logger(`${name.toUpperCase()}Provider`);
  }

  abstract chat(params: LLMChatParams): Promise<LLMResponse>;
  abstract chatStream(params: Omit<LLMChatParams, 'tools' | 'jsonMode'>): AsyncIterable<string>;
  abstract healthCheck(): Promise<boolean>;

  /**
   * 粗略估算 Token 数
   * 英文约 4 字符 1 token，中文约 1.5 字符 1 token
   * 取平均 3 字符 1 token
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // 中文和特殊字符较多时，约 1.5 字符 1 token
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 1.5 + otherChars / 4);
  }

  /**
   * 构建工具定义列表（OpenAI Function Calling 通用格式）
   *
   * 所有兼容 OpenAI 格式的 Provider 都可以复用此方法
   */
  buildToolDefinitions(skills: Array<{
    id: string;
    name: string;
    description: string;
    inputSchema?: any;
  }>): ToolDefinition[] {
    return skills.map((skill, index) => ({
      name: this.sanitizeToolName(skill.name) || `tool_${index}`,
      description: skill.description,
      parameters: skill.inputSchema
        ? typeof skill.inputSchema === 'string'
          ? JSON.parse(skill.inputSchema)
          : skill.inputSchema
        : {
            type: 'object' as const,
            properties: {
              input: { type: 'string', description: 'Input for the tool' },
            },
          },
    }));
  }

  /**
   * 工具名称清理：只允许字母数字下划线
   * 中文字符替换为下划线，多个连续下划线合并
   */
  protected sanitizeToolName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * 获取模型信息
   */
  getModelInfo(modelId: string): LLMModelInfo | undefined {
    return this.supportedModels.find((m) => m.id === modelId);
  }

  /**
   * 获取默认模型 ID
   */
  protected getDefaultModelId(): string {
    const defaultModel = this.supportedModels.find((m) => m.isDefault);
    return defaultModel?.id || this.defaultModel;
  }

  /**
   * 构建请求体（通用部分）
   */
  protected buildRequestBody(params: LLMChatParams): Record<string, any> {
    const model = params.model || this.defaultModel;
    const modelInfo = this.getModelInfo(model);

    const body: Record<string, any> = {
      model,
      messages: params.messages.map((m) => ({
        role: m.role === 'supervisor' ? 'assistant' : m.role,
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? modelInfo?.capabilities.maxOutputTokens ?? 2048,
    };

    // JSON Mode
    if (params.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    // 停止序列
    if (params.stopSequences && params.stopSequences.length > 0) {
      body.stop = params.stopSequences;
    }

    return body;
  }

  /**
   * 构建工具调用请求部分（OpenAI 格式）
   */
  protected buildToolsPayload(tools: ToolDefinition[]): any[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * 解析工具调用响应（OpenAI 格式）
   */
  protected parseToolCalls(toolCalls: any[]): Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }> {
    return toolCalls.map((tc: any) => ({
      id: tc.id || tc.function?.name || `call_${Date.now()}`,
      name: tc.function?.name || tc.name,
      arguments:
        typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments || tc.arguments || {},
    }));
  }

  /**
   * 解析 Token 使用量（OpenAI 格式）
   */
  protected parseUsage(usage: any): { promptTokens: number; completionTokens: number; totalTokens: number } | undefined {
    if (!usage) return undefined;
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }
}
