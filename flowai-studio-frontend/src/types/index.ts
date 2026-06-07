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
