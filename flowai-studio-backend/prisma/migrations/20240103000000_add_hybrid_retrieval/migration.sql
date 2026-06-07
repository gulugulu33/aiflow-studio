-- Phase 2.2: 混合检索支持
-- 新增 vectorWeight 和 rrfK 字段，支持 BM25 + 向量检索 RRF 融合

-- 添加混合检索配置字段
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "vector_weight" DOUBLE PRECISION NOT NULL DEFAULT 0.7;
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "rrf_k" INTEGER NOT NULL DEFAULT 60;

-- 为 document_chunks 表创建全文搜索 GIN 索引
-- 用于 BM25 关键词检索（Phase 2.2）
-- 注意：此索引使用 'simple' 配置，支持中文分词的配置（zhparser/pg_jieba）需要在 PostgreSQL 中安装对应扩展
CREATE INDEX IF NOT EXISTS "idx_document_chunks_content_fts"
ON "document_chunks" USING gin (to_tsvector('simple', content));

-- 为 document_chunks 的 metadata 字段添加 GIN 索引
-- 加速元数据过滤查询（混合检索中常用）
CREATE INDEX IF NOT EXISTS "idx_document_chunks_metadata_gin"
ON "document_chunks" USING gin (metadata);

-- 为 document_chunks 的 metadata->>'knowledgeBaseId' 添加索引
-- 加速按知识库 ID 过滤的查询
CREATE INDEX IF NOT EXISTS "idx_document_chunks_kb_id"
ON "document_chunks" ((metadata->>'knowledgeBaseId'));
