import { IsString, IsOptional, IsNumber, IsIn, Min, Max } from 'class-validator';

/**
 * 创建知识库 DTO
 *
 * Phase 2.2 增强:
 * - 新增 retrievalMode 字段: 支持 vector / keyword / hybrid 三种检索模式
 * - 新增 vectorWeight 字段: 混合检索中向量检索权重（默认 0.7）
 * - 新增 rrfK 字段: RRF 融合常数（默认 60）
 * - 扩展 similarityThreshold: 混合检索中也适用
 *
 * 竞品对标:
 * - Dify: 支持 vector / keyword / hybrid 检索模式，hybrid 支持 RRF 融合
 * - FastGPT: 支持 vector / fullText / hybrid，hybrid 使用权重融合
 * - Coze: 仅向量检索
 * - 本设计: RRF 融合 + 加权 RRF + 自适应降级
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
}
