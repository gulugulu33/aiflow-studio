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

  // 文件上传配置
  UPLOAD_PATH: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('10485760'),

  // 数据库配置 — PostgreSQL + pgvector
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis 配置
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

export type EnvConfig = z.infer<typeof envSchema>;
