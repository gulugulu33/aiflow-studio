/**
 * Agent 执行器服务
 *
 * Phase 3.1 核心实现 — 基于 LangGraph.js 的多智能体架构
 *
 * 架构设计:
 * 1. Single Agent: 单 Agent + ReAct 循环（思考→行动→观察→...）
 * 2. Supervisor Agent: Supervisor 协调多个 Worker Agent
 * 3. Swarm Agent: 去中心化协作（Phase 3.x 后续扩展）
 *
 * 核心能力:
 * - ReAct 循环: LLM 推理 + 工具调用 + 观察结果
 * - 工具绑定: 复用 SkillService，自动转换为 Function Calling 格式
 * - RAG 集成: Agent 可自主决策是否需要知识库检索
 * - 执行轨迹: 完整记录 Agent 思考、行动过程
 * - 迭代限制: 防止无限循环
 * - SSE 推送: 实时展示 Agent 执行过程
 */
import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, END, START } from '@langchain/langgraph';
import { LLMProviderService } from './llm-provider.service';
import { SkillService } from '../../skill/services/skill.service';
import { RAGService } from '../../rag/services/rag.service';
import { PrismaService } from '../../../common/services/prisma.service';
import {
  AgentNodeConfig,
  AgentState,
  AgentExecutionResult,
  AgentMessage,
  AgentTraceEntry,
  WorkerAgentConfig,
  ToolResult,
  ToolCall,
  ToolDefinition,
  AgentRunOptions,
} from '../interfaces/agent.interface';

@Injectable()
export class AgentExecutorService {
  private readonly logger = new Logger(AgentExecutorService.name);

  constructor(
    private readonly llmProvider: LLMProviderService,
    private readonly skillService: SkillService,
    private readonly ragService: RAGService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 执行 Agent
   *
   * 根据 AgentNodeConfig 中的 mode 选择执行模式
   */
  async execute(
    config: AgentNodeConfig,
    input: string,
    options?: AgentRunOptions,
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      let result: AgentExecutionResult;

      switch (config.mode) {
        case 'single':
          result = await this.executeSingleAgent(config, input, options);
          break;
        case 'supervisor':
          result = await this.executeSupervisorAgent(config, input, options);
          break;
        default:
          result = await this.executeSingleAgent(config, input, options);
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      this.logger.error(
        `Agent execution failed: ${error instanceof Error ? error.message : error}`,
      );
      return {
        result: '',
        messages: [],
        trace: [
          {
            type: 'error',
            content: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          },
        ],
        toolCallCount: 0,
        ragCallCount: 0,
        iterations: 0,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================
  // Single Agent (ReAct 循环)
  // ============================================================

  /**
   * 执行单 Agent ReAct 循环
   *
   * 流程:
   * 1. 初始化状态
   * 2. Agent 思考（LLM 推理）
   * 3. 如果 LLM 决定调用工具 → 执行工具 → 观察结果 → 回到步骤 2
   * 4. 如果 LLM 给出最终答案 → 结束
   * 5. 达到最大迭代次数 → 强制结束
   */
  private async executeSingleAgent(
    config: AgentNodeConfig,
    input: string,
    options?: AgentRunOptions,
  ): Promise<AgentExecutionResult> {
    const agentConfig = config.singleAgent!;
    const maxIterations = options?.maxIterations ?? config.maxIterations ?? 10;

    // 初始化状态
    const state: AgentState = {
      input,
      output: '',
      messages: [
        {
          role: 'system',
          content: agentConfig.systemPrompt || '你是一个智能助手，可以使用工具来帮助用户解决问题。',
          agentId: agentConfig.id,
          timestamp: Date.now(),
        },
        {
          role: 'user',
          content: input,
          timestamp: Date.now(),
        },
      ],
      toolResults: [],
      ragResults: [],
      iteration: 0,
      finished: false,
      trace: [],
    };

    // 加载可用工具
    const tools = await this.loadTools(agentConfig.toolIds);
    const toolMap = this.buildToolMap(tools);
    const toolDefinitions = this.llmProvider.buildToolDefinitions(tools);

    // RAG 上下文（如果启用）
    if (agentConfig.ragEnabled && agentConfig.knowledgeBaseIds.length > 0) {
      await this.enrichWithRAG(state, agentConfig.knowledgeBaseIds, input);
    }

    // ReAct 循环
    while (state.iteration < maxIterations && !state.finished) {
      state.iteration++;

      this.pushTrace(state, {
        type: 'thinking',
        content: `Agent 思考中... (迭代 ${state.iteration}/${maxIterations})`,
        agentId: agentConfig.id,
        timestamp: Date.now(),
      });

      // SSE 推送
      this.pushSSE(options, {
        type: 'agent_thinking',
        data: {
          agentId: agentConfig.id,
          iteration: state.iteration,
          maxIterations,
        },
      });

      // 调用 LLM
      const llmResponse = await this.llmProvider.chat({
        messages: state.messages.map((m) => ({
          role: m.role === 'supervisor' ? 'assistant' : m.role,
          content: m.content,
        })),
        model: agentConfig.model,
        temperature: agentConfig.temperature,
        maxTokens: agentConfig.maxTokens,
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      });

      // 如果有工具调用 → 执行工具
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        // 记录 assistant 消息（含工具调用）
        state.messages.push({
          role: 'assistant',
          content: llmResponse.content || '',
          agentId: agentConfig.id,
          toolCalls: llmResponse.toolCalls,
          timestamp: Date.now(),
        });

        // 逐个执行工具
        for (const toolCall of llmResponse.toolCalls) {
          const toolResult = await this.executeToolCall(
            toolCall,
            toolMap,
            options?.context,
          );
          state.toolResults.push(toolResult);

          // 将工具结果添加到消息历史
          state.messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.result),
            agentId: agentConfig.id,
            timestamp: Date.now(),
          });

          this.pushTrace(state, {
            type: 'tool_call',
            content: `调用工具: ${toolCall.name}`,
            agentId: agentConfig.id,
            timestamp: Date.now(),
            data: {
              toolName: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult.success ? '成功' : '失败',
            },
          });

          this.pushTrace(state, {
            type: 'tool_result',
            content: `工具返回: ${JSON.stringify(toolResult.result).slice(0, 200)}`,
            agentId: agentConfig.id,
            timestamp: Date.now(),
          });

          // SSE 推送工具调用
          this.pushSSE(options, {
            type: 'agent_tool_call',
            data: {
              agentId: agentConfig.id,
              toolName: toolCall.name,
              success: toolResult.success,
            },
          });
        }
      } else {
        // 没有工具调用，LLM 给出最终答案
        state.output = llmResponse.content || '';
        state.finished = true;

        state.messages.push({
          role: 'assistant',
          content: state.output,
          agentId: agentConfig.id,
          timestamp: Date.now(),
        });

        this.pushTrace(state, {
          type: 'final_answer',
          content: `Agent 给出最终答案`,
          agentId: agentConfig.id,
          timestamp: Date.now(),
        });

        this.pushSSE(options, {
          type: 'agent_final_answer',
          data: {
            agentId: agentConfig.id,
            output: state.output.slice(0, 200),
          },
        });
      }
    }

    // 达到最大迭代次数但未完成
    if (!state.finished) {
      state.output = state.messages
        .filter((m) => m.role === 'assistant' && m.content)
        .pop()?.content || 'Agent 达到最大迭代次数，未能完成任务。';

      this.pushTrace(state, {
        type: 'error',
        content: `达到最大迭代次数 ${maxIterations}`,
        agentId: agentConfig.id,
        timestamp: Date.now(),
      });
    }

    return {
      result: state.output,
      messages: state.messages,
      trace: state.trace,
      toolCallCount: state.toolResults.length,
      ragCallCount: state.ragResults.length,
      iterations: state.iteration,
      duration: 0, // 由 execute() 设置
      success: true,
    };
  }

  // ============================================================
  // Supervisor Agent
  // ============================================================

  /**
   * 执行 Supervisor Agent
   *
   * 流程:
   * 1. Supervisor 分析用户输入，决定分配给哪个 Worker
   * 2. Worker 执行任务（可能包含工具调用）
   * 3. Worker 返回结果给 Supervisor
   * 4. Supervisor 决定是否需要继续分配任务或给出最终答案
   * 5. 循环直到 Supervisor 给出最终答案或达到最大迭代次数
   */
  private async executeSupervisorAgent(
    config: AgentNodeConfig,
    input: string,
    options?: AgentRunOptions,
  ): Promise<AgentExecutionResult> {
    const supervisorConfig = config.supervisor!;
    const maxIterations = options?.maxIterations ?? config.maxIterations ?? 15;

    // 初始化状态
    const state: AgentState = {
      input,
      output: '',
      messages: [
        {
          role: 'system',
          content: this.buildSupervisorSystemPrompt(supervisorConfig),
          timestamp: Date.now(),
        },
        {
          role: 'user',
          content: input,
          timestamp: Date.now(),
        },
      ],
      toolResults: [],
      ragResults: [],
      iteration: 0,
      finished: false,
      trace: [],
    };

    // 预加载所有 Worker 的工具
    const workerToolMaps = new Map<string, {
      tools: ToolDefinition[];
      toolMap: Map<string, { id: string; name: string }>;
      config: WorkerAgentConfig;
    }>();

    for (const worker of supervisorConfig.workers) {
      const tools = await this.loadTools(worker.toolIds);
      const toolMap = this.buildToolMap(tools);
      const toolDefinitions = this.llmProvider.buildToolDefinitions(tools);
      workerToolMaps.set(worker.id, {
        tools: toolDefinitions,
        toolMap,
        config: worker,
      });
    }

    // 构建 Supervisor 可用的"委派工具"
    // 每个 Worker 都是一个可调用的"工具"
    const delegateTools: ToolDefinition[] = supervisorConfig.workers.map(
      (worker) => ({
        name: `delegate_to_${worker.id.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        description: `委派任务给 ${worker.name}: ${worker.description}`,
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: `分配给 ${worker.name} 的任务描述`,
            },
          },
          required: ['task'],
        },
      }),
    );

    // 添加 "finish" 工具
    delegateTools.push({
      name: 'finish',
      description: '当已经收集到足够信息，可以给出最终答案时调用此工具',
      parameters: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            description: '最终答案',
          },
        },
        required: ['answer'],
      },
    });

    // ReAct 循环（Supervisor 视角）
    while (state.iteration < maxIterations && !state.finished) {
      state.iteration++;

      this.pushTrace(state, {
        type: 'thinking',
        content: `Supervisor 思考中... (迭代 ${state.iteration}/${maxIterations})`,
        timestamp: Date.now(),
      });

      this.pushSSE(options, {
        type: 'supervisor_thinking',
        data: {
          iteration: state.iteration,
          maxIterations,
        },
      });

      // 调用 Supervisor LLM
      const supervisorResponse = await this.llmProvider.chat({
        messages: state.messages.map((m) => ({
          role: m.role === 'supervisor' ? 'assistant' : m.role,
          content: m.content,
        })),
        model: supervisorConfig.model,
        temperature: supervisorConfig.temperature,
        tools: delegateTools,
      });

      if (
        supervisorResponse.toolCalls &&
        supervisorResponse.toolCalls.length > 0
      ) {
        const toolCall = supervisorResponse.toolCalls[0]; // 每次只处理一个委派

        // 记录 Supervisor 的决策
        state.messages.push({
          role: 'supervisor',
          content: supervisorResponse.content || '',
          toolCalls: supervisorResponse.toolCalls,
          timestamp: Date.now(),
        });

        if (toolCall.name === 'finish') {
          // Supervisor 给出最终答案
          state.output = toolCall.arguments.answer || supervisorResponse.content || '';
          state.finished = true;

          this.pushTrace(state, {
            type: 'final_answer',
            content: 'Supervisor 给出最终答案',
            timestamp: Date.now(),
          });

          this.pushSSE(options, {
            type: 'supervisor_final_answer',
            data: { output: state.output.slice(0, 200) },
          });
        } else {
          // 委派给 Worker
          const workerId = this.extractWorkerId(toolCall.name, supervisorConfig.workers);
          const workerInfo = workerToolMaps.get(workerId);

          if (workerInfo) {
            this.pushTrace(state, {
              type: 'worker_delegate',
              content: `Supervisor 委派任务给 ${workerInfo.config.name}: ${toolCall.arguments.task}`,
              agentId: workerId,
              timestamp: Date.now(),
            });

            this.pushSSE(options, {
              type: 'worker_delegated',
              data: {
                workerId,
                workerName: workerInfo.config.name,
                task: toolCall.arguments.task,
              },
            });

            // 执行 Worker Agent
            const workerResult = await this.executeWorkerAgent(
              workerInfo.config,
              toolCall.arguments.task,
              workerInfo.tools,
              workerInfo.toolMap,
              options,
            );

            // 将 Worker 结果添加到 Supervisor 的消息历史
            state.messages.push({
              role: 'tool',
              content: `[${workerInfo.config.name} 的结果]: ${workerResult.result}`,
              agentId: workerId,
              timestamp: Date.now(),
            });

            // Worker 的工具调用已在其内部统计

            this.pushTrace(state, {
              type: 'worker_result',
              content: `${workerInfo.config.name} 完成: ${workerResult.result.slice(0, 200)}`,
              agentId: workerId,
              timestamp: Date.now(),
            });

            this.pushSSE(options, {
              type: 'worker_completed',
              data: {
                workerId,
                workerName: workerInfo.config.name,
                resultPreview: workerResult.result.slice(0, 200),
              },
            });
          } else {
            // Worker 不存在
            state.messages.push({
              role: 'tool',
              content: `错误: 未找到 ID 为 ${workerId} 的 Worker`,
              timestamp: Date.now(),
            });
          }
        }
      } else {
        // 没有工具调用，Supervisor 直接给出答案
        state.output = supervisorResponse.content || '';
        state.finished = true;

        state.messages.push({
          role: 'supervisor',
          content: state.output,
          timestamp: Date.now(),
        });

        this.pushTrace(state, {
          type: 'final_answer',
          content: 'Supervisor 直接给出答案',
          timestamp: Date.now(),
        });
      }
    }

    // 达到最大迭代次数
    if (!state.finished) {
      const lastAssistantMsg = state.messages
        .filter((m) => m.role === 'supervisor' && m.content)
        .pop();
      state.output = lastAssistantMsg?.content || 'Supervisor 达到最大迭代次数，未能完成任务。';

      this.pushTrace(state, {
        type: 'error',
        content: `达到最大迭代次数 ${maxIterations}`,
        timestamp: Date.now(),
      });
    }

    return {
      result: state.output,
      messages: state.messages,
      trace: state.trace,
      toolCallCount: state.toolResults.length,
      ragCallCount: state.ragResults.length,
      iterations: state.iteration,
      duration: 0,
      success: true,
    };
  }

  /**
   * 执行 Worker Agent (ReAct 循环)
   *
   * 与 Single Agent 类似，但迭代次数更保守
   */
  private async executeWorkerAgent(
    workerConfig: WorkerAgentConfig,
    task: string,
    toolDefinitions: ToolDefinition[],
    toolMap: Map<string, { id: string; name: string }>,
    options?: AgentRunOptions,
  ): Promise<AgentExecutionResult> {
    const maxIterations = 5; // Worker 最多 5 轮迭代

    const state: AgentState = {
      input: task,
      output: '',
      messages: [
        {
          role: 'system',
          content: workerConfig.systemPrompt || `你是一个专业助手，负责完成特定类型的任务。请根据任务描述，使用可用工具完成任务，并返回结果。`,
          agentId: workerConfig.id,
          timestamp: Date.now(),
        },
        {
          role: 'user',
          content: task,
          timestamp: Date.now(),
        },
      ],
      toolResults: [],
      ragResults: [],
      iteration: 0,
      finished: false,
      trace: [],
    };

    // RAG 上下文
    if (workerConfig.ragEnabled && workerConfig.knowledgeBaseIds.length > 0) {
      await this.enrichWithRAG(state, workerConfig.knowledgeBaseIds, task);
    }

    // ReAct 循环
    while (state.iteration < maxIterations && !state.finished) {
      state.iteration++;

      const llmResponse = await this.llmProvider.chat({
        messages: state.messages.map((m) => ({
          role: m.role === 'supervisor' ? 'assistant' : m.role,
          content: m.content,
        })),
        model: workerConfig.model,
        temperature: workerConfig.temperature,
        maxTokens: workerConfig.maxTokens,
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      });

      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        state.messages.push({
          role: 'assistant',
          content: llmResponse.content || '',
          agentId: workerConfig.id,
          toolCalls: llmResponse.toolCalls,
          timestamp: Date.now(),
        });

        for (const toolCall of llmResponse.toolCalls) {
          const toolResult = await this.executeToolCall(
            toolCall,
            toolMap,
            options?.context,
          );
          state.toolResults.push(toolResult);

          state.messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.result),
            agentId: workerConfig.id,
            timestamp: Date.now(),
          });
        }
      } else {
        state.output = llmResponse.content || '';
        state.finished = true;

        state.messages.push({
          role: 'assistant',
          content: state.output,
          agentId: workerConfig.id,
          timestamp: Date.now(),
        });
      }
    }

    if (!state.finished) {
      state.output =
        state.messages
          .filter((m) => m.role === 'assistant' && m.content)
          .pop()?.content || 'Worker 未能完成任务。';
    }

    return {
      result: state.output,
      messages: state.messages,
      trace: state.trace,
      toolCallCount: state.toolResults.length,
      ragCallCount: state.ragResults.length,
      iterations: state.iteration,
      duration: 0,
      success: true,
    };
  }

  // ============================================================
  // 工具管理
  // ============================================================

  /**
   * 加载工具列表
   */
  private async loadTools(
    toolIds: string[],
  ): Promise<Array<{ id: string; name: string; description: string; inputSchema: any }>> {
    if (!toolIds || toolIds.length === 0) {
      // 如果没有指定工具，加载所有内置工具
      const builtinSkills = await this.skillService.getBuiltinSkills();
      return builtinSkills.map((s) => ({
        id: s.type,
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema,
      }));
    }

    const tools: Array<{
      id: string;
      name: string;
      description: string;
      inputSchema: any;
    }> = [];

    for (const toolId of toolIds) {
      try {
        // 使用 PrismaService 直接查询（跳过 userId 权限校验）
        const skill = await this.prisma.skill.findUnique({
          where: { id: toolId },
        });

        if (skill) {
          tools.push({
            id: skill.id,
            name: skill.name || 'unknown',
            description: skill.description || '',
            inputSchema: skill.inputSchema
              ? typeof skill.inputSchema === 'string'
                ? JSON.parse(skill.inputSchema)
                : skill.inputSchema
              : undefined,
          });
        }
      } catch {
        this.logger.warn(`Tool ${toolId} not found, skipping`);
      }
    }

    return tools;
  }

  /**
   * 构建工具名称到 ID 的映射
   */
  private buildToolMap(
    tools: Array<{ id: string; name: string }>,
  ): Map<string, { id: string; name: string }> {
    const map = new Map<string, { id: string; name: string }>();
    for (const tool of tools) {
      // 使用处理后的名称作为 key（去除特殊字符）
      const sanitizedName = tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
      map.set(sanitizedName, { id: tool.id, name: tool.name });
    }
    return map;
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(
    toolCall: ToolCall,
    toolMap: Map<string, { id: string; name: string }>,
    context?: Record<string, any>,
  ): Promise<ToolResult> {
    const toolInfo = toolMap.get(toolCall.name);

    if (!toolInfo) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result: { error: `Tool ${toolCall.name} not found` },
        success: false,
        error: `Tool ${toolCall.name} not found`,
      };
    }

    try {
      // 替换参数中的上下文变量
      const resolvedArgs = this.resolveVariables(toolCall.arguments, context || {});

      const result = await this.skillService.executeSkill(
        toolInfo.id,
        resolvedArgs,
      );

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result,
        success: true,
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================
  // RAG 集成
  // ============================================================

  /**
   * 使用 RAG 丰富 Agent 上下文
   */
  private async enrichWithRAG(
    state: AgentState,
    knowledgeBaseIds: string[],
    query: string,
  ): Promise<void> {
    for (const kbId of knowledgeBaseIds) {
      try {
        const results = await this.ragService.retrieve(query, kbId, 5);
        const documents = results.map((r: any) => ({
          content: r.content,
          score: r.score,
          metadata: r.metadata,
        }));

        state.ragResults.push({
          knowledgeBaseId: kbId,
          documents,
        });

        // 将 RAG 结果注入系统消息
        if (documents.length > 0) {
          const ragContext = documents
            .map((d) => d.content)
            .join('\n\n');

          // 更新系统提示词
          const systemMsg = state.messages.find((m) => m.role === 'system');
          if (systemMsg) {
            systemMsg.content += `\n\n参考知识库内容:\n${ragContext}`;
          }
        }

        this.pushTrace(state, {
          type: 'rag_retrieve',
          content: `从知识库 ${kbId} 检索到 ${documents.length} 条相关内容`,
          timestamp: Date.now(),
        });
      } catch (error) {
        this.logger.warn(
          `RAG retrieval failed for KB ${kbId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 构建 Supervisor 系统提示词
   */
  private buildSupervisorSystemPrompt(
    config: { systemPrompt: string; workers: WorkerAgentConfig[] },
  ): string {
    const workerDescriptions = config.workers
      .map(
        (w) =>
          `- ${w.name} (delegate_to_${w.id.replace(/[^a-zA-Z0-9_]/g, '_')}): ${w.description}`,
      )
      .join('\n');

    return (
      config.systemPrompt ||
      `你是一个任务协调者（Supervisor），负责分析用户的需求，并将任务分配给合适的专家（Worker）来完成。

你可以使用以下专家:
${workerDescriptions}

请按以下步骤工作:
1. 分析用户的需求
2. 决定需要哪个专家来处理
3. 调用对应的委派工具，传入任务描述
4. 根据专家返回的结果，决定是否需要继续委派或给出最终答案
5. 当你有足够信息回答用户时，调用 finish 工具给出最终答案

注意:
- 每次只委派给一个专家
- 仔细分析专家返回的结果
- 如果信息不足，可以继续委派其他专家`
    );
  }

  /**
   * 从工具名称中提取 Worker ID
   */
  private extractWorkerId(
    toolName: string,
    workers: WorkerAgentConfig[],
  ): string {
    // delegate_to_xxx → 查找对应的 worker
    for (const worker of workers) {
      const sanitizedName = worker.id.replace(/[^a-zA-Z0-9_]/g, '_');
      if (toolName === `delegate_to_${sanitizedName}`) {
        return worker.id;
      }
    }
    // 尝试从工具名中提取
    const match = toolName.match(/delegate_to_(.+)/);
    return match ? match[1] : toolName;
  }

  /**
   * 变量替换（同 LLMNodeExecutor）
   */
  private resolveVariables(
    obj: Record<string, any>,
    context: Record<string, any>,
  ): Record<string, any> {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        resolved[key] = value.replace(/\{\{(.+?)\}\}/g, (match, p1) => {
          const keys = p1.trim().split('.');
          let val: any = context;
          for (const k of keys) {
            if (val && typeof val === 'object' && k in val) {
              val = val[k];
            } else {
              return match;
            }
          }
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        });
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveVariables(value, context);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * 添加轨迹条目
   */
  private pushTrace(state: AgentState, entry: AgentTraceEntry): void {
    state.trace.push(entry);
  }

  /**
   * SSE 推送
   */
  private pushSSE(options: AgentRunOptions | undefined, event: any): void {
    if (options?.sseSubject) {
      options.sseSubject.next(event);
    }
  }
}
