/**
 * Reranker Provider 抽象接口
 *
 * Phase 2.3 重排序设计:
 * - 将 reranker 抽象为接口，支持多种重排序模型
 * - Reranker 在检索后对候选文档进行精排，提升 top-K 结果的相关性
 * - 混合检索 + Reranker 是当前 RAG 最佳实践
 *
 * 为什么需要 Reranker:
 * - 向量检索和 BM25 都是基于单路信号进行排序
 * - Reranker 使用交叉注意力机制，同时建模 query 和 document 的交互
 * - 在相同 top-K 下，Reranker 能显著提升 Precision@K 和 NDCG@K
 *
 * 竞品对标:
 * - Dify: 支持 Cohere Rerank / bge-reranker-v2-m3
 * - FastGPT: 支持 Cohere Rerank
 * - Coze: 内置 reranker
 * - Flowise: 支持 Cohere Rerank / HuggingFace Reranker
 * - LangChain: CohereRerank / HuggingFacePipeline / FlashRank
 *
 * 本设计优势:
 * - 支持本地部署（Ollama bge-reranker）和云端 API（Cohere）
 * - 统一的 RerankerProvider 接口，工厂模式创建
 * - 每个知识库可配置是否启用 reranker
 * - 自动批处理，避免 API 限流
 */

/**
 * Reranker 请求参数
 */
export interface RerankRequest {
  /** 查询文本 */
  query: string;
  /** 候选文档列表 */
  documents: RerankDocument[];
  /** 返回结果数量（默认等于候选文档数） */
  topN?: number;
}

/**
 * 候选文档
 */
export interface RerankDocument {
  /** 文档 ID */
  id: string;
  /** 文档文本内容（reranker 的输入） */
  content: string;
  /** 原始分数（来自向量/关键词检索） */
  originalScore?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * Reranker 结果项
 */
export interface RerankResult {
  /** 文档 ID */
  id: string;
  /** 文档文本内容 */
  content: string;
  /** Reranker 相关性分数（0-1，越高越相关） */
  relevanceScore: number;
  /** 原始检索分数 */
  originalScore?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * Reranker 批量结果
 */
export interface RerankBatchResult {
  /** 重排序后的结果列表 */
  results: RerankResult[];
  /** 使用的模型 */
  model: string;
  /** Token 使用量（如有） */
  tokenUsage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Reranker 配置
 */
export interface RerankerProviderConfig {
  /** API Key */
  apiKey?: string;
  /** API Base URL */
  baseUrl?: string;
  /** 模型名称 */
  model: string;
  /** 最大并发数 */
  maxConcurrency?: number;
  /** 请求超时 (ms) */
  timeout?: number;
}

/**
 * Reranker Provider 接口
 */
export interface RerankerProvider {
  /**
   * 对候选文档进行重排序
   * @param request 重排序请求
   * @returns 重排序结果
   */
  rerank(request: RerankRequest): Promise<RerankBatchResult>;

  /**
   * 获取模型名称
   */
  getModel(): string;

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;
}
