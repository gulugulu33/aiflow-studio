/**
 * EmbeddingProvider 抽象接口
 *
 * 设计理念：
 * - 遵循依赖倒置原则 (DIP)，高层模块不依赖低层实现
 * - 支持运行时动态切换 Embedding 模型
 * - 每个知识库可使用不同的 Embedding Provider
 *
 * 竞品对标:
 * - Dify: 支持 OpenAI / Azure / 通义千问 / 本地模型
 * - FastGPT: 支持 OpenAI / 通义千问 / ChatGLM
 * - Coze: 仅支持内置模型
 * - Flowise: 支持 OpenAI / HuggingFace / Cohere
 *
 * 本设计优势:
 * - 统一接口 + 工厂模式，新增 Provider 只需实现接口 + 注册工厂
 * - 支持 OpenAI 兼容协议 (OpenAI / Qwen / DeepSeek 等共享同一实现)
 * - 支持 Ollama 本地部署
 */

/**
 * 向量生成结果
 */
export interface EmbeddingResult {
  /** 生成的向量 */
  embedding: number[];
  /** 使用的 token 数量（用于计费统计） */
  tokenUsage?: number;
}

/**
 * 批量向量生成结果
 */
export interface BatchEmbeddingResult {
  /** 成功生成的结果列表 */
  results: { content: string; embedding: number[]; tokenUsage?: number }[];
  /** 失败的分块索引 */
  failedIndices: number[];
  /** 总 token 使用量 */
  totalTokenUsage: number;
}

/**
 * Embedding Provider 配置
 */
export interface EmbeddingProviderConfig {
  /** API Key */
  apiKey: string;
  /** API 基础 URL（支持 OpenAI 兼容协议的端点） */
  baseUrl: string;
  /** 模型名称 */
  model: string;
  /** 向量维度 */
  dimensions: number;
  /** 请求超时时间 (ms) */
  timeout?: number;
  /** 最大并发数 */
  maxConcurrency?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * Embedding Provider 抽象接口
 *
 * 所有向量生成服务必须实现此接口
 * 包括: Qwen / OpenAI / Ollama / Cohere 等
 */
export interface EmbeddingProvider {
  /**
   * 获取 Provider 类型标识
   * e.g., 'qwen', 'openai', 'ollama', 'cohere'
   */
  readonly providerType: string;

  /**
   * 生成单个文本的向量嵌入
   *
   * @param text - 待向量化的文本
   * @returns 向量生成结果
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * 批量生成向量嵌入
   * 支持并发控制和失败重试
   *
   * @param texts - 待向量化的文本列表
   * @param concurrency - 并发数（默认 5）
   * @returns 批量向量生成结果
   */
  embedBatch(texts: string[], concurrency?: number): Promise<BatchEmbeddingResult>;

  /**
   * 获取当前 Provider 支持的向量维度
   */
  getDimensions(): number;

  /**
   * 获取当前 Provider 使用的模型名称
   */
  getModel(): string;

  /**
   * 健康检查 — 验证 API 连通性
   *
   * @returns 是否健康
   */
  healthCheck(): Promise<boolean>;
}
