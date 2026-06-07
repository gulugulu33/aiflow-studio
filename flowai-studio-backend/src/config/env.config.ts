import { z } from 'zod';

export const envSchema = z.object({
  // 服务器配置
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // JWT配置
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // 通义千问API配置
  QWEN_API_KEY: z.string().min(1, 'QWEN_API_KEY is required'),
  QWEN_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),

  // 通义千问向量模型配置
  QWEN_EMBEDDING_API_KEY: z.string().optional(),
  QWEN_EMBEDDING_MODEL: z.string().default('text-embedding-v3'),
  QWEN_EMBEDDING_DIMENSION: z.coerce.number().default(1024),

  // OpenAI Embedding 配置
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIMENSION: z.coerce.number().default(1536),

  // Ollama 本地模型配置
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  OLLAMA_EMBEDDING_DIMENSION: z.coerce.number().default(768),

  // 默认 Embedding Provider (qwen | openai | ollama)
  EMBEDDING_PROVIDER: z.string().default('qwen'),

  // 默认 Vector Store (pgvector | qdrant | milvus)
  VECTOR_STORE: z.string().default('pgvector'),

  // Qdrant 配置
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),

  // Milvus 配置
  MILVUS_URL: z.string().default('http://localhost:19530'),
  MILVUS_TOKEN: z.string().optional(),

  // 文件上传配置
  UPLOAD_PATH: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('10485760'),

  // 数据库配置 — PostgreSQL + pgvector
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis 配置
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

export type EnvConfig = z.infer<typeof envSchema>;
