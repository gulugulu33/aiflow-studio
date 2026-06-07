-- Migration: SQLite → PostgreSQL + pgvector
-- Author: FlowAI Team
-- Description: 数据库基础设施升级，从 SQLite 迁移到 PostgreSQL，集成 pgvector 向量扩展

-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 用户表
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- 3. 应用表
CREATE TABLE "applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "shareLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "applications_shareLink_key" ON "applications"("shareLink");
CREATE INDEX "applications_userId_idx" ON "applications"("userId");

ALTER TABLE "applications"
    ADD CONSTRAINT "applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. 工作流表
CREATE TABLE "workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nodes" TEXT NOT NULL,
    "edges" TEXT NOT NULL,
    "variables" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" UUID NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflows_applicationId_idx" ON "workflows"("applicationId");

ALTER TABLE "workflows"
    ADD CONSTRAINT "workflows_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. 工作流执行记录表
CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inputs" TEXT,
    "context" TEXT,
    "logs" TEXT,
    "error" TEXT,
    "duration" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workflowId" UUID NOT NULL,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_executions_workflowId_idx" ON "workflow_executions"("workflowId");

ALTER TABLE "workflow_executions"
    ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. 知识库表
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-v3',
    "embeddingDimension" INTEGER NOT NULL DEFAULT 1024,
    "chunkSize" INTEGER NOT NULL DEFAULT 500,
    "chunkOverlap" INTEGER NOT NULL DEFAULT 50,
    "topK" INTEGER NOT NULL DEFAULT 5,
    "similarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "retrievalMode" TEXT NOT NULL DEFAULT 'vector',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_bases_name_userId_key" ON "knowledge_bases"("name", "userId");
CREATE INDEX "knowledge_bases_userId_idx" ON "knowledge_bases"("userId");

ALTER TABLE "knowledge_bases"
    ADD CONSTRAINT "knowledge_bases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. 文档表
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'text/markdown',
    "size" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "error" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "knowledgeBaseId" UUID NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "documents_name_knowledgeBaseId_key" ON "documents"("name", "knowledgeBaseId");
CREATE INDEX "documents_knowledgeBaseId_idx" ON "documents"("knowledgeBaseId");

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. 文档分块表 — 使用 pgvector 的 vector 类型
CREATE TABLE "document_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "chunkIndex" INTEGER NOT NULL,
    "startIndex" INTEGER NOT NULL,
    "endIndex" INTEGER NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" UUID NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_chunks_documentId_idx" ON "document_chunks"("documentId");

-- 为向量字段创建 HNSW 索引（加速近似最近邻搜索）
-- 竞品对标: Dify 默认使用 HNSW 索引进行向量检索
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx" ON "document_chunks"
    USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "document_chunks"
    ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. 技能表
CREATE TABLE "skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "builtinType" TEXT,
    "config" TEXT,
    "inputSchema" TEXT,
    "outputSchema" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "skills_userId_idx" ON "skills"("userId");

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. 对话历史表
CREATE TABLE "chat_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "references" TEXT,
    "toolCalls" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,

    CONSTRAINT "chat_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_histories_sessionId_idx" ON "chat_histories"("sessionId");
CREATE INDEX "chat_histories_userId_idx" ON "chat_histories"("userId");

ALTER TABLE "chat_histories"
    ADD CONSTRAINT "chat_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 11. MCP 服务器表
CREATE TABLE "mcp_servers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "transportType" TEXT NOT NULL DEFAULT 'stdio',
    "command" TEXT,
    "args" TEXT,
    "env" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_servers_name_userId_key" ON "mcp_servers"("name", "userId");
CREATE INDEX "mcp_servers_userId_idx" ON "mcp_servers"("userId");

ALTER TABLE "mcp_servers"
    ADD CONSTRAINT "mcp_servers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
