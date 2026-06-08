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
export type NodeType = 'start' | 'userInput' | 'llm' | 'rag' | 'skill' | 'condition' | 'output' | 'agent'

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

/** Agent 模式类型 */
export type AgentMode = 'single' | 'supervisor'

/** Agent 执行策略 */
export type AgentStrategy = 'react' | 'plan-and-execute' | 'reflection'

/** Worker Agent 配置 */
export interface WorkerConfig {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  temperature: number
  maxTokens: number
  toolIds: string[]
  knowledgeBaseIds: string[]
  ragEnabled: boolean
}

/** Agent 节点数据 */
export interface AgentNodeData extends BaseNodeData {
  /** Agent 模式: single / supervisor */
  agentMode: AgentMode
  /** 执行策略 */
  strategy: AgentStrategy
  /** 模型 */
  model: string
  /** 系统提示词 */
  systemPrompt: string
  /** 用户提示词 */
  userPrompt: string
  /** 温度 */
  temperature: number
  /** 最大 Token */
  maxTokens: number
  /** 最大迭代轮数 */
  maxIterations: number
  /** 工具 ID 列表 */
  toolIds: string[]
  /** 知识库 ID 列表 */
  knowledgeBaseIds: string[]
  /** 是否启用 RAG */
  ragEnabled: boolean
  /** 是否启用记忆 */
  memoryEnabled: boolean
  /** 记忆窗口大小 */
  memoryWindowSize: number
  /** Supervisor 模式专用 */
  supervisorPrompt?: string
  /** Worker 列表 (supervisor 模式) */
  workers?: WorkerConfig[]
}

export type WorkflowNodeData =
  | StartNodeData
  | UserInputNodeData
  | LLMNodeData
  | RAGNodeData
  | SkillNodeData
  | ConditionNodeData
  | OutputNodeData
  | AgentNodeData

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

/** Embedding Provider 类型 */
export type EmbeddingProviderType = 'qwen' | 'openai' | 'ollama'

/** 向量存储后端类型 */
export type VectorStoreType = 'pgvector' | 'qdrant' | 'milvus'

/** Embedding 模型选项 */
export const EMBEDDING_MODELS: Record<EmbeddingProviderType, { label: string; value: string; dimension: number }[]> = {
  qwen: [
    { label: 'text-embedding-v3 (1024维)', value: 'text-embedding-v3', dimension: 1024 },
    { label: 'text-embedding-v2 (1536维)', value: 'text-embedding-v2', dimension: 1536 },
    { label: 'text-embedding-v1 (768维)', value: 'text-embedding-v1', dimension: 768 },
  ],
  openai: [
    { label: 'text-embedding-3-small (1536维)', value: 'text-embedding-3-small', dimension: 1536 },
    { label: 'text-embedding-3-large (3072维)', value: 'text-embedding-3-large', dimension: 3072 },
    { label: 'text-embedding-ada-002 (1536维)', value: 'text-embedding-ada-002', dimension: 1536 },
  ],
  ollama: [
    { label: 'nomic-embed-text (768维)', value: 'nomic-embed-text', dimension: 768 },
    { label: 'mxbai-embed-large (1024维)', value: 'mxbai-embed-large', dimension: 1024 },
    { label: 'all-minilm (384维)', value: 'all-minilm', dimension: 384 },
    { label: 'bge-m3 (1024维)', value: 'bge-m3', dimension: 1024 },
  ],
}

/** 向量存储选项 */
export const VECTOR_STORE_OPTIONS: { label: string; value: VectorStoreType; description: string }[] = [
  { label: 'pgvector', value: 'pgvector', description: 'PostgreSQL + pgvector 扩展（默认，无需额外部署）' },
  { label: 'Qdrant', value: 'qdrant', description: '高性能向量数据库（适合大规模检索）' },
  { label: 'Milvus', value: 'milvus', description: '分布式向量数据库（适合亿级向量）' },
]

/** Reranker Provider 类型 */
export type RerankerProviderType = 'cohere' | 'ollama' | 'none'

export interface KnowledgeBase {
  id: string
  name: string
  description?: string
  type?: string
  embeddingProvider: EmbeddingProviderType
  embeddingModel: string
  embeddingDimension: number
  vectorStore: VectorStoreType
  chunkSize: number
  chunkOverlap: number
  topK: number
  similarityThreshold: number
  retrievalMode: 'vector' | 'keyword' | 'hybrid'
  vectorWeight: number
  rrfK: number
  // Phase 2.3: Reranker 配置
  rerankerEnabled: boolean
  rerankerProvider: RerankerProviderType
  rerankerModel: string
  rerankerTopN?: number
  userId: string
  createdAt: string
  updatedAt: string
  documents?: Document[]
}

/** 检索模式选项 */
export const RETRIEVAL_MODE_OPTIONS: { label: string; value: KnowledgeBase['retrievalMode']; description: string; color: string }[] = [
  { label: '向量检索', value: 'vector', description: '语义匹配，适合同义词、语义关联场景', color: '#1677ff' },
  { label: '关键词检索', value: 'keyword', description: 'BM25 精确匹配，适合专有名词、编号场景', color: '#52c41a' },
  { label: '混合检索', value: 'hybrid', description: '向量+关键词 RRF 融合，推荐生产使用', color: '#722ed1' },
]

/** Reranker Provider 选项 */
export const RERANKER_PROVIDER_OPTIONS: { label: string; value: RerankerProviderType; description: string; color: string }[] = [
  { label: '不使用', value: 'none', description: '不使用重排序，返回原始检索结果', color: '#8c8c8c' },
  { label: 'Cohere Rerank', value: 'cohere', description: '业界最强重排序 API，支持多语言（需 API Key）', color: '#1677ff' },
  { label: 'Ollama 本地', value: 'ollama', description: '本地部署重排序模型，零 API 成本，数据不出服务器', color: '#52c41a' },
]

/** Cohere Reranker 可选模型 */
export const COHERE_RERANK_MODELS = [
  { label: 'rerank-v3.5（推荐）', value: 'rerank-v3.5' },
  { label: 'rerank-english-v3.0（英文）', value: 'rerank-english-v3.0' },
  { label: 'rerank-multilingual-v3.0（多语言）', value: 'rerank-multilingual-v3.0' },
]

/** Ollama Reranker 可选模型 */
export const OLLAMA_RERANK_MODELS = [
  { label: 'bge-reranker-v2-m3（推荐，多语言）', value: 'bge-reranker-v2-m3' },
  { label: 'bge-reranker-v2-gemma（更高精度）', value: 'bge-reranker-v2-gemma' },
]

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
