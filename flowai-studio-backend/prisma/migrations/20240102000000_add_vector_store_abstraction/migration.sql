-- Phase 2.1: 多向量库抽象层 — 添加 embeddingProvider 和 vectorStore 字段
-- 对标 Dify: 每个知识库可选择不同的 Embedding 模型和向量数据库

-- 添加 Embedding Provider 类型字段 (qwen / openai / ollama)
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "embedding_provider" TEXT NOT NULL DEFAULT 'qwen';

-- 添加 Vector Store 类型字段 (pgvector / qdrant / milvus)
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "vector_store" TEXT NOT NULL DEFAULT 'pgvector';

-- 根据 embedding_model 自动推断 embedding_provider（数据迁移）
UPDATE "knowledge_bases"
SET "embedding_provider" = CASE
  WHEN "embedding_model" LIKE 'text-embedding-v%' THEN 'qwen'
  WHEN "embedding_model" LIKE 'text-embedding-3%' OR "embedding_model" LIKE 'text-embedding-ada%' THEN 'openai'
  WHEN "embedding_model" IN ('nomic-embed-text', 'mxbai-embed-large', 'all-minilm', 'bge-m3') THEN 'ollama'
  ELSE 'qwen'
END
WHERE "embedding_provider" = 'qwen'
  AND "embedding_model" NOT LIKE 'text-embedding-v%';
