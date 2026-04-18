import { z } from 'zod';

export const envSchema = z
  .object({
    // 服务器配置
    PORT: z.string().default('3001'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    FRONTEND_URL: z.string().default('http://localhost:5173'),

    // JWT 配置
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_EXPIRES_IN: z.string().default('7d'),

    // 上游网关配置（OpenAI 兼容接口）
    // 规则：默认走 QWEN（见下方 QWEN_*）。只有当同时设置 OPENAI_API_KEY + OPENAI_BASE_URL 时，才切换到自定义 OpenAI 兼容网关。
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_BASE_URL: z.string().min(1).optional(),
    QWEN_API_KEY: z.string().min(1).optional(),
    QWEN_BASE_URL: z
      .string()
      .optional()
      .default('https://dashscope.aliyuncs.com/compatible-mode/v1'),

    // 上游模型配置
    // 注意：仅在启用 OPENAI 网关模式（同时设置 OPENAI_API_KEY + OPENAI_BASE_URL）时才要求填写。
    OPENAI_CHAT_MODEL: z.string().min(1).optional(),
    OPENAI_EMBEDDING_MODEL: z.string().min(1).optional(),

    // 文件上传配置
    UPLOAD_PATH: z.string().default('./uploads'),
    MAX_FILE_SIZE: z.string().default('10485760'),

    // 数据库配置
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  })
  .superRefine((env, ctx) => {
    const hasOpenAiKey = typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.length > 0;
    const hasOpenAiBaseUrl = typeof env.OPENAI_BASE_URL === 'string' && env.OPENAI_BASE_URL.length > 0;
    const useOpenAiGateway = hasOpenAiKey && hasOpenAiBaseUrl;

    const hasQwenKey = typeof env.QWEN_API_KEY === 'string' && env.QWEN_API_KEY.length > 0;

    if ((hasOpenAiKey && !hasOpenAiBaseUrl) || (!hasOpenAiKey && hasOpenAiBaseUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'To enable OPENAI gateway, set both OPENAI_API_KEY and OPENAI_BASE_URL',
        path: ['OPENAI_BASE_URL'],
      });
    }

    if (!useOpenAiGateway && !hasQwenKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'QWEN_API_KEY is required (or set OPENAI_API_KEY + OPENAI_BASE_URL)',
        path: ['QWEN_API_KEY'],
      });
    }

    if (useOpenAiGateway) {
      const hasChatModel = typeof env.OPENAI_CHAT_MODEL === 'string' && env.OPENAI_CHAT_MODEL.length > 0;
      const hasEmbeddingModel =
        typeof env.OPENAI_EMBEDDING_MODEL === 'string' && env.OPENAI_EMBEDDING_MODEL.length > 0;

      if (!hasChatModel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'OPENAI_CHAT_MODEL is required when using OPENAI gateway',
          path: ['OPENAI_CHAT_MODEL'],
        });
      }

      if (!hasEmbeddingModel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'OPENAI_EMBEDDING_MODEL is required when using OPENAI gateway',
          path: ['OPENAI_EMBEDDING_MODEL'],
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;
