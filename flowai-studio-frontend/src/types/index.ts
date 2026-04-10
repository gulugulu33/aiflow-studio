// 用户相关类型
export interface User {
  id: string
  username: string
  avatar?: string
  createdAt: string
}

export interface LoginForm {
  username: string
  password: string
}

export interface RegisterForm {
  username: string
  password: string
}

// API响应类型
export interface ApiResponse<T> {
  success: boolean
  code: string
  message: string
  data: T
  timestamp: string
}

// 应用相关类型
export interface Application {
  id: string
  name: string
  description?: string
  icon?: string
  status: 'draft' | 'published' | 'archived'
  shareLink?: string
  createdAt: string
  updatedAt: string
}

export interface CreateAppForm {
  name: string
  description?: string
  icon?: string
}

// 工作流相关类型
export type NodeType = 'start' | 'userInput' | 'llm' | 'rag' | 'skill' | 'condition' | 'output'

export interface BaseNodeData {
  label: string
  [key: string]: unknown
}

export interface StartNodeData extends BaseNodeData {
  variables: { key: string; value: any }[]
}

export interface UserInputNodeData extends BaseNodeData {
  inputField: string
}

export interface LLMNodeData extends BaseNodeData {
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  maxTokens: number
}

export interface RAGNodeData extends BaseNodeData {
  knowledgeBaseId: string
  query: string
  topK: number
  similarityThreshold: number
}

export interface SkillNodeData extends BaseNodeData {
  skillId: string
  skillType: 'builtin' | 'custom'
  parameters: Record<string, any>
}

export interface ConditionNodeData extends BaseNodeData {
  conditions: { variable: string; operator: string; value: any }[]
}

export interface OutputNodeData extends BaseNodeData {
  outputValue: any
}

export type WorkflowNodeData = 
  | StartNodeData 
  | UserInputNodeData 
  | LLMNodeData 
  | RAGNodeData 
  | SkillNodeData 
  | ConditionNodeData 
  | OutputNodeData

export interface WorkflowNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: WorkflowNodeData
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// 知识库相关类型
export interface KnowledgeBase {
  id: string
  name: string
  description?: string
  type?: string
  userId: string
  createdAt: string
  updatedAt: string
  documents?: Document[]
}

export interface Document {
  id: string
  name: string
  size: number
  filePath?: string
  knowledgeBaseId: string
  createdAt: string
  updatedAt: string
}

export interface DocumentChunk {
  id: string
  content: string
  chunkIndex: number
  startIndex: number
  endIndex: number
  metadata?: string
  createdAt: string
}

export interface DocumentChunksResponse {
  documentId: string
  documentName: string
  totalChunks: number
  chunks: DocumentChunk[]
}

// Skill工具相关类型
export interface Skill {
  id: string
  name: string
  description?: string
  type: 'builtin' | 'custom'
  builtinType?: string
  config?: Record<string, unknown>
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// 聊天消息类型
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  references?: DocumentReference[]
  toolCalls?: ToolCall[]
  createdAt: string
}

export interface DocumentReference {
  documentId: string
  documentName: string
  content: string
  similarity: number
}

export interface ToolCall {
  toolName: string
  params: Record<string, unknown>
  result: unknown
}

// 节点执行状态
export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'failed'

export interface NodeExecution {
  nodeId: string
  status: NodeExecutionStatus
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  error?: string
  startedAt?: string
  completedAt?: string
}
