/**
 * Agent 模块核心接口定义
 *
 * Phase 3.1: LangGraph.js 集成 — 多智能体架构
 *
 * 设计理念:
 * - Supervisor/Worker 模式: Supervisor Agent 负责任务分配和协调
 * - 支持 ReAct (Reasoning + Acting) 循环
 * - 支持工具调用（复用 SkillService）
 * - 支持 RAG 知识检索（复用 RAGService）
 * - 支持多轮对话和记忆
 */

import { RunnableConfig } from '@langchain/core/runnables';

// ============================================================
// Agent 配置
// ============================================================

/** Agent 模式 */
export type AgentMode = 'single' | 'supervisor' | 'swarm';

/** Agent 执行策略 */
export type AgentStrategy = 'react' | 'plan-and-execute' | 'reflection';

/** 单个 Worker Agent 配置 */
export interface WorkerAgentConfig {
  /** Agent 唯一标识 */
  id: string;
  /** Agent 名称 */
  name: string;
  /** Agent 角色描述 */
  description: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 使用的 LLM 模型 */
  model: string;
  /** 温度参数 */
  temperature: number;
  /** 最大 token 数 */
  maxTokens: number;
  /** 可使用的工具 ID 列表 */
  toolIds: string[];
  /** 可使用的知识库 ID 列表 */
  knowledgeBaseIds: string[];
  /** 是否启用 RAG */
  ragEnabled: boolean;
}

/** Supervisor Agent 配置 */
export interface SupervisorAgentConfig {
  /** Supervisor 系统提示词 */
  systemPrompt: string;
  /** 使用的 LLM 模型 */
  model: string;
  /** 温度参数 */
  temperature: number;
  /** 最大迭代轮数 */
  maxIterations: number;
  /** Worker Agent 列表 */
  workers: WorkerAgentConfig[];
}

/** Agent 节点完整配置 */
export interface AgentNodeConfig {
  /** Agent 模式 */
  mode: AgentMode;
  /** 执行策略 */
  strategy: AgentStrategy;
  /** 单 Agent 配置 (mode=single 时使用) */
  singleAgent?: WorkerAgentConfig;
  /** Supervisor 配置 (mode=supervisor 时使用) */
  supervisor?: SupervisorAgentConfig;
  /** 最大迭代轮数 */
  maxIterations: number;
  /** 是否启用记忆 */
  memoryEnabled: boolean;
  /** 记忆窗口大小（保留最近 N 轮对话） */
  memoryWindowSize: number;
}

// ============================================================
// Agent 状态
// ============================================================

/** Agent 运行时状态 (LangGraph State) */
export interface AgentState {
  /** 用户输入 */
  input: string;
  /** 当前 Agent 的输出 */
  output: string;
  /** 对话历史 */
  messages: AgentMessage[];
  /** 当前活动的 Worker ID */
  currentWorker?: string;
  /** 工具调用结果 */
  toolResults: ToolResult[];
  /** RAG 检索结果 */
  ragResults: RAGResult[];
  /** 迭代计数 */
  iteration: number;
  /** 是否完成 */
  finished: boolean;
  /** 执行轨迹（用于调试和可视化） */
  trace: AgentTraceEntry[];
  /** 错误信息 */
  error?: string;
}

/** Agent 消息 */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'supervisor';
  content: string;
  /** 消息来源的 Agent ID */
  agentId?: string;
  /** 工具调用信息 */
  toolCalls?: ToolCall[];
  /** 时间戳 */
  timestamp: number;
}

/** 工具调用 */
export interface ToolCall {
  /** 工具 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  arguments: Record<string, any>;
}

/** 工具调用结果 */
export interface ToolResult {
  /** 对应的工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 执行结果 */
  result: any;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** RAG 检索结果 */
export interface RAGResult {
  /** 知识库 ID */
  knowledgeBaseId: string;
  /** 检索到的文档 */
  documents: Array<{
    content: string;
    score: number;
    metadata?: Record<string, any>;
  }>;
}

/** Agent 执行轨迹条目 */
export interface AgentTraceEntry {
  /** 步骤类型 */
  type: 'thinking' | 'tool_call' | 'tool_result' | 'rag_retrieve' | 'worker_delegate' | 'worker_result' | 'final_answer' | 'error';
  /** 步骤描述 */
  content: string;
  /** 关联的 Agent ID */
  agentId?: string;
  /** 时间戳 */
  timestamp: number;
  /** 额外数据 */
  data?: Record<string, any>;
}

// ============================================================
// Agent 执行结果
// ============================================================

/** Agent 执行结果 */
export interface AgentExecutionResult {
  /** 最终输出 */
  result: string;
  /** 完整对话历史 */
  messages: AgentMessage[];
  /** 执行轨迹 */
  trace: AgentTraceEntry[];
  /** 工具调用统计 */
  toolCallCount: number;
  /** RAG 调用统计 */
  ragCallCount: number;
  /** 总迭代次数 */
  iterations: number;
  /** 执行耗时 (ms) */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// Agent 服务接口
// ============================================================

/** LLM Provider 接口（为 Phase 3.2 多模型支持预留） */
export interface ILLMProvider {
  /** Provider 名称 */
  name: string;
  /** 调用 LLM */
  chat(params: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[];
  }): Promise<LLMResponse>;
  /** 流式调用 */
  chatStream(params: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): AsyncIterable<string>;
}

/** 工具定义（OpenAI Function Calling 格式） */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/** LLM 响应 */
export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Agent 运行选项 */
export interface AgentRunOptions {
  /** 工作流执行上下文 */
  context?: Record<string, any>;
  /** SSE 推送 Subject（可选） */
  sseSubject?: any;
  /** 最大迭代轮数覆盖 */
  maxIterations?: number;
}
