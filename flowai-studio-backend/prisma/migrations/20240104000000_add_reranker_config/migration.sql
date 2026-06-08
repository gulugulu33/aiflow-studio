-- Phase 2.3: 添加 Reranker 配置字段到 KnowledgeBase
-- 支持 Cohere Rerank API + Ollama 本地 Reranker

-- 是否启用重排序（默认关闭）
ALTER TABLE "knowledge_bases" ADD COLUMN "rerankerEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Reranker Provider 类型: cohere / ollama / none
ALTER TABLE "knowledge_bases" ADD COLUMN "rerankerProvider" TEXT NOT NULL DEFAULT 'none';

-- Reranker 模型名称
ALTER TABLE "knowledge_bases" ADD COLUMN "rerankerModel" TEXT NOT NULL DEFAULT '';

-- 重排序返回的文档数量 (null 表示不截断, 保持与 topK 一致)
ALTER TABLE "knowledge_bases" ADD COLUMN "rerankerTopN" INTEGER;
