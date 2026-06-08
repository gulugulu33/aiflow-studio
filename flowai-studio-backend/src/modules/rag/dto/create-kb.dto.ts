import { IsString, IsOptional, IsNumber, IsIn, IsBoolean, Min, Max } from 'class-validator';

/**
 * 创建知识库 DTO
 *
 * Phase 2.3 增强:
 * - 新增 rerankerEnabled 字段: 是否启用重排序
 * - 新增 rerankerProvider 字段: 重排序 Provider 类型（cohere / ollama / none）
 * - 新增 rerankerModel 字段: 重排序模型名称
 * - 新增 rerankerTopN 字段: 重排序后返回的文档数
 *
 * 竞品对标:
 * - Dify: 支持 Cohere Rerank，不支持本地模型
 * - FastGPT: 支持 Cohere Rerank，不支持本地模型
 * - Flowise: 支持 HuggingFace + Cohere Rerank
 * - 本设计: Cohere + Ollama 本地（零成本 + 数据隐私）+ 工厂模式可扩展
 */
export class CreateKnowledgeBaseDto {
  @IsString({ message: 'Name must be a string' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  /**
   * Embedding Provider 类型
   * - qwen: 通义千问（默认）
   * - openai: OpenAI / 兼容协议
   * - ollama: Ollama 本地模型
   */
  @IsOptional()
  @IsString({ message: 'Embedding provider must be a string' })
  @IsIn(['qwen', 'openai', 'ollama'], {
    message: 'Embedding provider must be qwen, openai, or ollama',
  })
  embeddingProvider?: string;

  @IsOptional()
  @IsString({ message: 'Embedding model must be a string' })
  @IsIn(
    [
      // Qwen 系列
      'text-embedding-v1', 'text-embedding-v2', 'text-embedding-v3',
      // OpenAI 系列
      'text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002',
      // Ollama 系列
      'nomic-embed-text', 'mxbai-embed-large', 'all-minilm', 'bge-m3',
    ],
    {
      message: 'Invalid embedding model',
    },
  )
  embeddingModel?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Embedding dimension must be a number' })
  @IsIn([384, 768, 1024, 1536, 3072], {
    message: 'Embedding dimension must be 384, 768, 1024, 1536, or 3072',
  })
  embeddingDimension?: number;

  /**
   * 向量存储后端类型
   * - pgvector: PostgreSQL + pgvector（默认）
   * - qdrant: Qdrant 高性能向量数据库
   * - milvus: Milvus / Zilliz Cloud 分布式向量数据库
   */
  @IsOptional()
  @IsString({ message: 'Vector store must be a string' })
  @IsIn(['pgvector', 'qdrant', 'milvus'], {
    message: 'Vector store must be pgvector, qdrant, or milvus',
  })
  vectorStore?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Chunk size must be a number' })
  @Min(100, { message: 'Chunk size must be at least 100' })
  @Max(2000, { message: 'Chunk size must not exceed 2000' })
  chunkSize?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Chunk overlap must be a number' })
  @Min(0, { message: 'Chunk overlap must be at least 0' })
  @Max(500, { message: 'Chunk overlap must not exceed 500' })
  chunkOverlap?: number;

  @IsOptional()
  @IsNumber({}, { message: 'TopK must be a number' })
  @Min(1, { message: 'TopK must be at least 1' })
  @Max(20, { message: 'TopK must not exceed 20' })
  topK?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Similarity threshold must be a number' })
  @Min(0, { message: 'Similarity threshold must be at least 0' })
  @Max(1, { message: 'Similarity threshold must not exceed 1' })
  similarityThreshold?: number;

  /**
   * 检索模式
   * - vector: 纯向量检索（语义匹配，适合同义词/语义关联场景）
   * - keyword: 纯关键词检索（BM25，适合精确匹配/专有名词/编号场景）
   * - hybrid: 混合检索（向量 + 关键词 RRF 融合，推荐生产使用）
   *
   * 竞品对标:
   * - Dify: 支持 vector / keyword / hybrid
   * - FastGPT: 支持 vector / fullText / hybrid
   * - Coze: 仅 vector
   */
  @IsOptional()
  @IsString({ message: 'Retrieval mode must be a string' })
  @IsIn(['vector', 'keyword', 'hybrid'], {
    message: 'Retrieval mode must be vector, keyword, or hybrid',
  })
  retrievalMode?: string;

  /**
   * 混合检索中向量检索权重（0-1）
   * 关键词权重 = 1 - vectorWeight
   * 默认 0.7（偏向向量检索，因为语义匹配通常更重要）
   *
   * 竞品对标:
   * - Dify: 支持调整向量/关键词权重
   * - FastGPT: 支持自定义权重
   * - 本设计: 默认 0.7/0.3，用户可调
   */
  @IsOptional()
  @IsNumber({}, { message: 'Vector weight must be a number' })
  @Min(0, { message: 'Vector weight must be at least 0' })
  @Max(1, { message: 'Vector weight must not exceed 1' })
  vectorWeight?: number;

  /**
   * RRF 融合常数 K
   * 增大 K → 低排名结果影响增大（更平等）
   * 减小 K → 高排名结果影响增大（更偏向头部）
   * 默认 60（学术推荐值）
   *
   * 参考文献: Cormack et al. (2009) SIGIR
   */
  @IsOptional()
  @IsNumber({}, { message: 'RRF K must be a number' })
  @Min(1, { message: 'RRF K must be at least 1' })
  @Max(200, { message: 'RRF K must not exceed 200' })
  rrfK?: number;

  // ──────────────────────────────────────
  // 重排序配置 (Phase 2.3)
  // ──────────────────────────────────────

  /**
   * 是否启用重排序
   * 启用后，检索结果会经过 Reranker 二次排序，提高 Top-K 精度
   *
   * 竞品对标:
   * - Dify: 支持开关 Rerank
   * - FastGPT: 支持开关 Rerank
   * - 本设计: 默认关闭，用户按需开启
   */
  @IsOptional()
  @IsBoolean({ message: 'Reranker enabled must be a boolean' })
  rerankerEnabled?: boolean;

  /**
   * Reranker Provider 类型
   * - cohere: Cohere Rerank API（最强精度，需 API Key）
   * - ollama: Ollama 本地部署（零成本，数据不出服务器）
   * - none: 不使用重排序
   *
   * 竞品对标:
   * - Dify: 仅支持 Cohere
   * - FastGPT: 仅支持 Cohere
   * - Flowise: 支持 HuggingFace + Cohere
   * - 本设计: Cohere + Ollama + 工厂模式可扩展第三方
   */
  @IsOptional()
  @IsString({ message: 'Reranker provider must be a string' })
  @IsIn(['cohere', 'ollama', 'none'], {
    message: 'Reranker provider must be cohere, ollama, or none',
  })
  rerankerProvider?: string;

  /**
   * Reranker 模型名称
   * - Cohere: rerank-v3.5 / rerank-english-v3.0 / rerank-multilingual-v3.0
   * - Ollama: bge-reranker-v2-m3 / bge-reranker-v2-gemma
   */
  @IsOptional()
  @IsString({ message: 'Reranker model must be a string' })
  rerankerModel?: string;

  /**
   * 重排序后返回的文档数量
   * null / undefined 表示不截断，保持与 topK 一致
   * 建议值: 3-10，减少 LLM 上下文长度
   *
   * 竞品对标:
   * - Dify: 支持 TopN 配置
   * - FastGPT: 支持 TopN 配置
   * - 本设计: 默认与 topK 一致，可按需缩减
   */
  @IsOptional()
  @IsNumber({}, { message: 'Reranker topN must be a number' })
  @Min(1, { message: 'Reranker topN must be at least 1' })
  @Max(20, { message: 'Reranker topN must not exceed 20' })
  rerankerTopN?: number;
}
