-- FlowAI Studio — PostgreSQL 初始化脚本
-- 自动启用 pgvector 扩展
-- 此脚本通过 docker-entrypoint-initdb.d 自动执行

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 验证 pgvector 安装
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE NOTICE 'pgvector extension enabled successfully';
    ELSE
        RAISE WARNING 'pgvector extension not found, vector search will not be available';
    END IF;
END $$;
