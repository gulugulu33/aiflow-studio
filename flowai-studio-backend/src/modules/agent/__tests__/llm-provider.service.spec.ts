/**
 * QwenProvider 单元测试
 *
 * 测试覆盖:
 * - Chat Completion
 * - 工具调用解析
 * - API 错误处理
 * - 工具定义构建
 * - 工具名称清理
 */
import { QwenProvider } from '../providers/qwen.provider';

// Mock axios
jest.mock('axios');
const axios = require('axios');

describe('QwenProvider', () => {
  let provider: QwenProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new QwenProvider({
      apiKey: 'test-api-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      timeout: 30000,
    });
  });

  describe('chat', () => {
    it('should call Qwen API and return response', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '你好！' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'qwen-turbo',
        },
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: '你好' }],
        model: 'qwen-turbo',
      });

      expect(result.content).toBe('你好！');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.totalTokens).toBe(15);
    });

    it('should parse tool calls from response', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_123',
                function: { name: 'calculator', arguments: '{"expression": "1+1"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          model: 'qwen-turbo',
        },
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: '计算1+1' }],
        model: 'qwen-turbo',
        tools: [{ name: 'calculator', description: '计算', parameters: { type: 'object', properties: { expression: { type: 'string' } } } }],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('calculator');
      expect(result.toolCalls![0].arguments).toEqual({ expression: '1+1' });
    });

    it('should handle API errors', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: { message: 'API 限流' } } },
        message: 'Request failed',
      });

      await expect(provider.chat({
        messages: [{ role: 'user', content: '测试' }],
      })).rejects.toThrow('Qwen API call failed');
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

      const definitions = provider.buildToolDefinitions(skills);

      expect(definitions).toHaveLength(2);
      expect(definitions[0].name).toMatch(/^[a-zA-Z0-9_]+$/); // 中文名被清理
      expect(definitions[0].parameters.properties.expression).toBeDefined();
      expect(definitions[1].parameters.properties.input).toBeDefined(); // 无 schema 用默认
    });

    it('should sanitize tool names', () => {
      const skills = [
        { id: '1', name: 'JSON处理工具', description: '测试', inputSchema: undefined },
      ];

      const definitions = provider.buildToolDefinitions(skills);

      // 中文名应被替换为合法字符
      expect(definitions[0].name).toMatch(/^[a-zA-Z0-9_]+$/);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for English text', () => {
      const tokens = provider.estimateTokens('Hello, world!');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for Chinese text', () => {
      const tokens = provider.estimateTokens('你好世界');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty string', () => {
      expect(provider.estimateTokens('')).toBe(0);
    });
  });
});
