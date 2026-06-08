/**
 * LLM Provider 服务
 *
 * 当前基于 Qwen API (DashScope)，兼容 OpenAI 格式
 * Phase 3.2 将扩展为多模型支持（OpenAI/Claude/Gemini/Qwen/Ollama）
 *
 * 核心功能:
 * - Chat Completion（含工具调用）
 * - 流式 Chat Completion
 * - Function Calling 支持
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ILLMProvider,
  LLMResponse,
  ToolDefinition,
  ToolCall,
} from '../interfaces/agent.interface';

@Injectable()
export class LLMProviderService implements ILLMProvider {
  private readonly logger = new Logger(LLMProviderService.name);
  readonly name = 'qwen';

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('QWEN_API_KEY', '');
    this.baseUrl = this.configService.get<string>(
      'QWEN_BASE_URL',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
  }

  /**
   * Chat Completion（非流式）
   *
   * 支持:
   * - 普通对话
   * - Function Calling / 工具调用
   * - 多轮对话
   */
  async chat(params: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[];
  }): Promise<LLMResponse> {
    const {
      messages,
      model = 'qwen-turbo',
      temperature = 0.7,
      maxTokens = 2048,
      tools,
    } = params;

    const requestBody: any = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    // 工具调用支持
    if (tools && tools.length > 0) {
      requestBody.tools = tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // Agent 模式可能需要更长时间
        },
      );

      const choice = response.data.choices[0];
      const message = choice.message;

      const result: LLMResponse = {
        content: message.content || '',
      };

      // 解析工具调用
      if (message.tool_calls && message.tool_calls.length > 0) {
        result.toolCalls = message.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments,
        }));
      }

      // 解析 token 使用量
      if (response.data.usage) {
        result.usage = {
          promptTokens: response.data.usage.prompt_tokens || 0,
          completionTokens: response.data.usage.completion_tokens || 0,
          totalTokens: response.data.usage.total_tokens || 0,
        };
      }

      return result;
    } catch (error) {
      this.logger.error(
        `LLM API call failed: ${error.response?.data || error.message}`,
      );
      throw new Error(
        `LLM API call failed: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * 流式 Chat Completion
   *
   * 用于实时输出 Agent 思考过程
   */
  async *chatStream(params: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): AsyncIterable<string> {
    const {
      messages,
      model = 'qwen-turbo',
      temperature = 0.7,
      maxTokens = 2048,
    } = params;

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: 60000,
      },
    );

    let buffer = '';

    for await (const chunk of response.data) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留未完成的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          const content = data.choices[0]?.delta?.content || '';
          if (content) {
            yield content;
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  /**
   * 构建工具定义列表
   *
   * 将 SkillService 的技能转换为 OpenAI Function Calling 格式
   */
  buildToolDefinitions(skills: Array<{
    id: string;
    name: string;
    description: string;
    inputSchema?: any;
  }>): ToolDefinition[] {
    return skills.map((skill) => ({
      name: skill.name.replace(/[^a-zA-Z0-9_]/g, '_'), // 函数名只允许字母数字下划线
      description: skill.description,
      parameters: skill.inputSchema
        ? typeof skill.inputSchema === 'string'
          ? JSON.parse(skill.inputSchema)
          : skill.inputSchema
        : {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Input for the tool' },
            },
          },
    }));
  }
}
