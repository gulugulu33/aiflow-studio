/**
 * AgentExecutorService 单元测试
 *
 * Phase 3.1 测试覆盖:
 * - Single Agent ReAct 循环
 * - 工具调用与结果处理
 * - 最大迭代次数限制
 * - Supervisor/Worker 模式
 * - RAG 集成
 * - 执行轨迹
 * - 错误处理
 */
import { AgentExecutorService } from '../services/agent-executor.service';
import { LLMProviderService } from '../services/llm-provider.service';
import { SkillService } from '../../skill/services/skill.service';
import { RAGService } from '../../rag/services/rag.service';
import {
  AgentNodeConfig,
  LLMResponse,
} from '../interfaces/agent.interface';

describe('AgentExecutorService', () => {
  let agentExecutor: AgentExecutorService;
  let mockLLMProvider: any;
  let mockSkillService: any;
  let mockRAGService: any;
  let mockPrismaService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock LLMProviderService
    mockLLMProvider = {
      chat: jest.fn(),
      buildToolDefinitions: jest.fn().mockReturnValue([]),
    };

    // Mock SkillService
    mockSkillService = {
      getBuiltinSkills: jest.fn().mockResolvedValue([
        { type: 'calculator', name: '计算器', description: '计算数学表达式', inputSchema: { type: 'object', properties: { expression: { type: 'string' } } } },
      ]),
      findSkillById: jest.fn(),
      executeSkill: jest.fn(),
    };

    // Mock RAGService
    mockRAGService = {
      retrieve: jest.fn(),
    };

    // Mock PrismaService
    mockPrismaService = {
      skill: {
        findUnique: jest.fn(),
      },
    };

    agentExecutor = new AgentExecutorService(
      mockLLMProvider as any,
      mockSkillService as any,
      mockRAGService as any,
      mockPrismaService as any,
    );
  });

  // ============================================================
  // Single Agent
  // ============================================================

  describe('Single Agent', () => {
    const singleConfig: AgentNodeConfig = {
      mode: 'single',
      strategy: 'react',
      maxIterations: 10,
      memoryEnabled: false,
      memoryWindowSize: 10,
      singleAgent: {
        id: 'test_agent',
        name: '测试助手',
        description: '测试用',
        systemPrompt: '你是一个测试助手。',
        model: 'qwen-turbo',
        temperature: 0.7,
        maxTokens: 2048,
        toolIds: [],
        knowledgeBaseIds: [],
        ragEnabled: false,
      },
    };

    it('should return final answer when LLM responds without tool calls', async () => {
      // LLM 直接给出最终答案
      mockLLMProvider.chat.mockResolvedValue({
        content: '这是最终答案',
        toolCalls: undefined,
      });

      const result = await agentExecutor.execute(singleConfig, '你好');

      expect(result.success).toBe(true);
      expect(result.result).toBe('这是最终答案');
      expect(result.iterations).toBe(1);
      expect(result.toolCallCount).toBe(0);
    });

    it('should call tools and then give final answer', async () => {
      // 第一次调用: LLM 决定调用工具
      mockLLMProvider.chat
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'calculator',
              arguments: { expression: '2+2' },
            },
          ],
        })
        // 第二次调用: LLM 给出最终答案
        .mockResolvedValueOnce({
          content: '2+2=4',
          toolCalls: undefined,
        });

      mockLLMProvider.buildToolDefinitions.mockReturnValue([
        {
          name: 'calculator',
          description: '计算数学表达式',
          parameters: { type: 'object', properties: { expression: { type: 'string' } } },
        },
      ]);

      mockSkillService.executeSkill.mockResolvedValue({
        success: true,
        data: { expression: '2+2', result: 4 },
      });

      const result = await agentExecutor.execute(singleConfig, '2+2等于多少？');

      expect(result.success).toBe(true);
      expect(result.result).toBe('2+2=4');
      expect(result.iterations).toBe(2);
      expect(result.toolCallCount).toBe(1);
    });

    it('should stop at max iterations', async () => {
      // LLM 一直调用工具，不给出最终答案
      mockLLMProvider.chat.mockResolvedValue({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'calculator',
            arguments: { expression: '1+1' },
          },
        ],
      });

      mockLLMProvider.buildToolDefinitions.mockReturnValue([
        {
          name: 'calculator',
          description: '计算',
          parameters: { type: 'object', properties: { expression: { type: 'string' } } },
        },
      ]);

      mockSkillService.executeSkill.mockResolvedValue({ result: 2 });

      const config: AgentNodeConfig = {
        ...singleConfig,
        maxIterations: 3,
      };

      const result = await agentExecutor.execute(config, '循环测试');

      expect(result.success).toBe(true);
      expect(result.iterations).toBe(3);
      expect(result.toolCallCount).toBe(3);
    });

    it('should include trace entries for thinking and tool calls', async () => {
      mockLLMProvider.chat
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            { id: 'call_1', name: 'calculator', arguments: { expression: '1+1' } },
          ],
        })
        .mockResolvedValueOnce({
          content: '1+1=2',
          toolCalls: undefined,
        });

      mockLLMProvider.buildToolDefinitions.mockReturnValue([
        { name: 'calculator', description: '计算', parameters: { type: 'object', properties: { expression: { type: 'string' } } } },
      ]);

      mockSkillService.executeSkill.mockResolvedValue({ result: 2 });

      const result = await agentExecutor.execute(singleConfig, '1+1=?');

      // 应包含: thinking, tool_call, tool_result, thinking, final_answer
      const traceTypes = result.trace.map((t) => t.type);
      expect(traceTypes).toContain('thinking');
      expect(traceTypes).toContain('tool_call');
      expect(traceTypes).toContain('tool_result');
      expect(traceTypes).toContain('final_answer');
    });
  });

  // ============================================================
  // Supervisor Agent
  // ============================================================

  describe('Supervisor Agent', () => {
    const supervisorConfig: AgentNodeConfig = {
      mode: 'supervisor',
      strategy: 'react',
      maxIterations: 15,
      memoryEnabled: false,
      memoryWindowSize: 10,
      supervisor: {
        systemPrompt: '你是任务协调者。',
        model: 'qwen-plus',
        temperature: 0.3,
        maxIterations: 15,
        workers: [
          {
            id: 'researcher',
            name: '研究员',
            description: '负责信息搜索和分析',
            systemPrompt: '你是一个研究员。',
            model: 'qwen-turbo',
            temperature: 0.7,
            maxTokens: 2048,
            toolIds: [],
            knowledgeBaseIds: [],
            ragEnabled: false,
          },
          {
            id: 'writer',
            name: '写作者',
            description: '负责内容撰写',
            systemPrompt: '你是一个写作者。',
            model: 'qwen-turbo',
            temperature: 0.7,
            maxTokens: 2048,
            toolIds: [],
            knowledgeBaseIds: [],
            ragEnabled: false,
          },
        ],
      },
    };

    it('should delegate to worker and return final answer', async () => {
      // 1. Supervisor 决定委派给 researcher
      mockLLMProvider.chat
        .mockResolvedValueOnce({
          content: '让我委派研究员来搜索信息。',
          toolCalls: [
            {
              id: 'call_1',
              name: 'delegate_to_researcher',
              arguments: { task: '搜索关于AI的信息' },
            },
          ],
        })
        // 2. Worker (researcher) 执行任务
        .mockResolvedValueOnce({
          content: 'AI 是人工智能的缩写...',
          toolCalls: undefined,
        })
        // 3. Supervisor 给出最终答案
        .mockResolvedValueOnce({
          content: '根据研究员的调研结果，AI 是...',
          toolCalls: [
            {
              id: 'call_2',
              name: 'finish',
              arguments: { answer: 'AI 是人工智能的缩写，涵盖机器学习、深度学习等领域。' },
            },
          ],
        });

      const result = await agentExecutor.execute(supervisorConfig, '什么是AI？');

      expect(result.success).toBe(true);
      expect(result.result).toContain('人工智能');
      expect(result.trace.some((t) => t.type === 'worker_delegate')).toBe(true);
      expect(result.trace.some((t) => t.type === 'worker_result')).toBe(true);
      expect(result.trace.some((t) => t.type === 'final_answer')).toBe(true);
    });
  });

  // ============================================================
  // RAG 集成
  // ============================================================

  describe('RAG Integration', () => {
    it('should enrich agent context with RAG results', async () => {
      const configWithRAG: AgentNodeConfig = {
        mode: 'single',
        strategy: 'react',
        maxIterations: 10,
        memoryEnabled: false,
        memoryWindowSize: 10,
        singleAgent: {
          id: 'rag_agent',
          name: 'RAG 助手',
          description: '知识库问答',
          systemPrompt: '基于知识库回答问题。',
          model: 'qwen-turbo',
          temperature: 0.7,
          maxTokens: 2048,
          toolIds: [],
          knowledgeBaseIds: ['kb_123'],
          ragEnabled: true,
        },
      };

      mockRAGService.retrieve.mockResolvedValue([
        { content: 'FlowAI 是一个 AI 编排平台', score: 0.95, metadata: {} },
      ]);

      mockLLMProvider.chat.mockResolvedValue({
        content: 'FlowAI 是一个 AI 编排平台。',
        toolCalls: undefined,
      });

      const result = await agentExecutor.execute(configWithRAG, 'FlowAI 是什么？');

      expect(mockRAGService.retrieve).toHaveBeenCalledWith('FlowAI 是什么？', 'kb_123', 5);
      expect(result.ragCallCount).toBe(1);
      expect(result.trace.some((t) => t.type === 'rag_retrieve')).toBe(true);
    });

    it('should handle RAG failure gracefully', async () => {
      const configWithRAG: AgentNodeConfig = {
        mode: 'single',
        strategy: 'react',
        maxIterations: 10,
        memoryEnabled: false,
        memoryWindowSize: 10,
        singleAgent: {
          id: 'rag_agent',
          name: 'RAG 助手',
          description: '知识库问答',
          systemPrompt: '基于知识库回答问题。',
          model: 'qwen-turbo',
          temperature: 0.7,
          maxTokens: 2048,
          toolIds: [],
          knowledgeBaseIds: ['kb_404'],
          ragEnabled: true,
        },
      };

      mockRAGService.retrieve.mockRejectedValue(new Error('知识库不存在'));
      mockLLMProvider.chat.mockResolvedValue({
        content: '抱歉，我无法访问知识库。',
        toolCalls: undefined,
      });

      const result = await agentExecutor.execute(configWithRAG, '测试');

      expect(result.success).toBe(true);
      // RAG 失败不应导致整个 Agent 执行失败
    });
  });

  // ============================================================
  // 错误处理
  // ============================================================

  describe('Error Handling', () => {
    it('should return error result when LLM API fails', async () => {
      mockLLMProvider.chat.mockRejectedValue(new Error('API 限流'));

      const config: AgentNodeConfig = {
        mode: 'single',
        strategy: 'react',
        maxIterations: 10,
        memoryEnabled: false,
        memoryWindowSize: 10,
        singleAgent: {
          id: 'test_agent',
          name: '测试',
          description: '',
          systemPrompt: '你好',
          model: 'qwen-turbo',
          temperature: 0.7,
          maxTokens: 2048,
          toolIds: [],
          knowledgeBaseIds: [],
          ragEnabled: false,
        },
      };

      const result = await agentExecutor.execute(config, '测试');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API 限流');
    });

    it('should handle tool execution failure gracefully', async () => {
      mockLLMProvider.chat
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            { id: 'call_1', name: 'calculator', arguments: { expression: 'invalid' } },
          ],
        })
        .mockResolvedValueOnce({
          content: '计算出现错误，让我直接告诉你答案。',
          toolCalls: undefined,
        });

      mockLLMProvider.buildToolDefinitions.mockReturnValue([
        { name: 'calculator', description: '计算', parameters: { type: 'object', properties: { expression: { type: 'string' } } } },
      ]);

      mockSkillService.executeSkill.mockRejectedValue(new Error('表达式无效'));

      const config: AgentNodeConfig = {
        mode: 'single',
        strategy: 'react',
        maxIterations: 10,
        memoryEnabled: false,
        memoryWindowSize: 10,
        singleAgent: {
          id: 'test_agent',
          name: '测试',
          description: '',
          systemPrompt: '你好',
          model: 'qwen-turbo',
          temperature: 0.7,
          maxTokens: 2048,
          toolIds: [],
          knowledgeBaseIds: [],
          ragEnabled: false,
        },
      };

      const result = await agentExecutor.execute(config, '测试');

      expect(result.success).toBe(true);
      // 工具失败后应继续执行
      expect(result.toolCallCount).toBe(1);
    });
  });
});
