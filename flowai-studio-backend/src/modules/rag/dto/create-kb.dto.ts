import { IsString, IsOptional, IsNumber, IsIn, Min, Max } from 'class-validator';

/**
 * 创建知识库 DTO
 *
 * Phase 2.1 增强:
 * - 新增 embeddingProvider 字段: 支持选择 Qwen/OpenAI/Ollama
 * - 新增 vectorStore 字段: 支持选择 pgvector/Qdrant/Milvus
 * - 扩展 embeddingModel 可选值: 支持 Qwen + OpenAI + Ollama 模型
 * - 扩展 embeddingDimension 可选值: 支持 384/768/1024/1536/3072
 *
 * 竞品对标:
 * - Dify: 每个知识库可选择 Embedding 模型和向量数据库
 * - FastGPT: 全局配置
 * - 本设计: 每个知识库独立配置（更灵活）
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

  @IsOptional()
  @IsString({ message: 'Retrieval mode must be a string' })
  @IsIn(['vector', 'keyword', 'hybrid'], {
    message: 'Retrieval mode must be vector, keyword, or hybrid',
  })
  retrievalMode?: string;
}
