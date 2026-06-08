/**
 * LLMProviderService 单元测试
 *
 * Phase 3.1 测试覆盖:
 * - Chat Completion（含工具调用）
 * - 工具定义构建
 * - 错误处理
 */
import { LLMProviderService } from '../services/llm-provider.service';
import { ConfigService } from '@nestjs/config';

// Mock axios
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LLMProviderService', () => {
  let llmProvider: LLMProviderService;
  let mockConfigService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          QWEN_API_KEY: 'test-api-key',
          QWEN_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        };
        return config[key] ?? defaultValue;
      }),
    };

    llmProvider = new LLMProviderService(mockConfigService);
  });

  describe('chat', () => {
    it('should call Qwen API and return response', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: '你好！我是AI助手。',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        },
      });

      const result = await llmProvider.chat({
        messages: [{ role: 'user', content: '你好' }],
      });

      expect(result.content).toBe('你好！我是AI助手。');
      expect(result.toolCalls).toBeUndefined();
      expect(result.usage?.totalTokens).toBe(30);
    });

    it('should parse tool calls from response', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call_123',
                    function: {
                      name: 'calculator',
                      arguments: '{"expression": "2+2"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
        },
      });

      const result = await llmProvider.chat({
        messages: [{ role: 'user', content: '2+2等于多少' }],
        tools: [
          {
            name: 'calculator',
            description: '计算数学表达式',
            parameters: {
              type: 'object',
              properties: { expression: { type: 'string' } },
            },
          },
        ],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('calculator');
      expect(result.toolCalls![0].arguments).toEqual({ expression: '2+2' });
    });

    it('should handle API errors', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { data: { error: { message: 'API rate limit exceeded' } } },
        message: 'Request failed with status code 429',
      });

      await expect(
        llmProvider.chat({
          messages: [{ role: 'user', content: '测试' }],
        }),
      ).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('buildToolDefinitions', () => {
    it('should convert skills to OpenAI function calling format', () => {
      const skills = [
        {
          id: 'skill_1',
          name: '计算器',
          description: '计算数学表达式',
          inputSchema: {
            type: 'object',
            properties: { expression: { type: 'string', description: '数学表达式' } },
            required: ['expression'],
          },
        },
        {
          id: 'skill_2',
          name: 'HTTP 请求',
          description: '发送HTTP请求',
          inputSchema: undefined,
        },
      ];

      const definitions = llmProvider.buildToolDefinitions(skills);

      expect(definitions).toHaveLength(2);
      expect(definitions[0].name).toBe('___'); // 中文名被替换为下划线
      expect(definitions[0].parameters.properties.expression).toBeDefined();
      expect(definitions[1].parameters.properties.input).toBeDefined(); // 无 schema 用默认
    });

    it('should sanitize tool names', () => {
      const skills = [
        { id: '1', name: 'JSON处理工具', description: '测试', inputSchema: undefined },
      ];

      const definitions = llmProvider.buildToolDefinitions(skills);

      // 中文名应被替换为下划线
      expect(definitions[0].name).toMatch(/^[a-zA-Z0-9_]+$/);
    });
  });
});
