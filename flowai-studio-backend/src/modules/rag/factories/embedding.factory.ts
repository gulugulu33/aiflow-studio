/**
 * Embedding Provider 工厂
 *
 * 根据配置动态创建 EmbeddingProvider 实例
 * 支持运行时切换 Provider，无需修改业务代码
 *
 * 设计模式: 工厂模式 + 注册表模式
 * - 新增 Provider 只需实现接口 + 注册到 factory
 * - 支持运行时动态注册
 *
 * 竞品对标:
 * - Dify: 通过配置文件选择 Embedding 模型
 * - LangChain: 通过 Embeddings 类继承体系
 * - 本设计: 通过工厂模式 + 接口，更灵活且类型安全
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider, EmbeddingProviderConfig } from '../interfaces/embedding-provider.interface';
import { QwenEmbeddingProvider } from '../providers/embedding/qwen-embedding.provider';
import { OpenAIEmbeddingProvider } from '../providers/embedding/openai-embedding.provider';
import { OllamaEmbeddingProvider } from '../providers/embedding/ollama-embedding.provider';

/**
 * Provider 注册表类型
 */
type ProviderConstructor = new (config: EmbeddingProviderConfig) => EmbeddingProvider;

/**
 * 默认 Embedding Provider 配置映射
 * 从环境变量读取各 Provider 的默认配置
 */
interface DefaultProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
}

@Injectable()
export class EmbeddingFactory {
  private readonly logger = new Logger(EmbeddingFactory.name);

  /** Provider 构造函数注册表 */
  private readonly providerRegistry = new Map<string, ProviderConstructor>();

  /** 已创建的 Provider 实例缓存（按配置指纹缓存） */
  private readonly providerCache = new Map<string, EmbeddingProvider>();

  /** 默认 Provider 配置 */
  private readonly defaultConfigs = new Map<string, DefaultProviderConfig>();

  constructor(private configService: ConfigService) {
    // 注册内置 Provider
    this.registerProvider('qwen', QwenEmbeddingProvider);
    this.registerProvider('openai', OpenAIEmbeddingProvider);
    this.registerProvider('ollama', OllamaEmbeddingProvider);

    // 从环境变量加载默认配置
    this.loadDefaultConfigs();
  }

  /**
   * 注册 Provider 构造函数
   * 支持运行时动态注册第三方 Provider
   */
  registerProvider(type: string, constructor: ProviderConstructor): void {
    this.providerRegistry.set(type, constructor);
    this.logger.log(`Registered embedding provider: ${type}`);
  }

  /**
   * 创建 Embedding Provider 实例
   *
   * @param providerType - Provider 类型 ('qwen' | 'openai' | 'ollama' | 自定义)
   * @param configOverride - 覆盖默认配置（可选）
   * @returns EmbeddingProvider 实例
   */
  create(providerType: string, configOverride?: Partial<EmbeddingProviderConfig>): EmbeddingProvider {
    const Constructor = this.providerRegistry.get(providerType);
    if (!Constructor) {
      throw new Error(
        `Unknown embedding provider type: "${providerType}". ` +
        `Available: ${[...this.providerRegistry.keys()].join(', ')}`,
      );
    }

    // 合并默认配置 + 覆盖配置
    const defaultConfig = this.defaultConfigs.get(providerType);
    const config: EmbeddingProviderConfig = {
      apiKey: configOverride?.apiKey ?? defaultConfig?.apiKey ?? '',
      baseUrl: configOverride?.baseUrl ?? defaultConfig?.baseUrl ?? '',
      model: configOverride?.model ?? defaultConfig?.model ?? 'text-embedding-v3',
      dimensions: configOverride?.dimensions ?? defaultConfig?.dimensions ?? 1024,
      timeout: configOverride?.timeout,
      maxConcurrency: configOverride?.maxConcurrency,
      maxRetries: configOverride?.maxRetries,
    };

    // 配置指纹（用于缓存）
    const fingerprint = `${providerType}:${config.apiKey}:${config.baseUrl}:${config.model}:${config.dimensions}`;

    // 缓存命中
    const cached = this.providerCache.get(fingerprint);
    if (cached) {
      return cached;
    }

    // 创建新实例
    const provider = new Constructor(config);
    this.providerCache.set(fingerprint, provider);

    this.logger.log(
      `Created embedding provider: ${providerType} (model: ${config.model}, dim: ${config.dimensions})`,
    );

    return provider;
  }

  /**
   * 获取默认的 Embedding Provider（基于环境变量配置）
   * 用于知识库未指定 Provider 时的回退
   */
  getDefaultProvider(): EmbeddingProvider {
    const defaultType = this.configService.get<string>('EMBEDDING_PROVIDER') ?? 'qwen';
    return this.create(defaultType);
  }

  /**
   * 获取所有已注册的 Provider 类型
   */
  getRegisteredTypes(): string[] {
    return [...this.providerRegistry.keys()];
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 从环境变量加载各 Provider 的默认配置
   */
  private loadDefaultConfigs(): void {
    // Qwen（通义千问）— 默认 Provider
    this.defaultConfigs.set('qwen', {
      apiKey:
        this.configService.get<string>('QWEN_EMBEDDING_API_KEY') ||
        this.configService.get<string>('QWEN_API_KEY') ||
        '',
      baseUrl:
        this.configService.get<string>('QWEN_BASE_URL') ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: this.configService.get<string>('QWEN_EMBEDDING_MODEL') || 'text-embedding-v3',
      dimensions: this.configService.get<number>('QWEN_EMBEDDING_DIMENSION') || 1024,
    });

    // OpenAI
    this.defaultConfigs.set('openai', {
      apiKey: this.configService.get<string>('OPENAI_API_KEY') || '',
      baseUrl: this.configService.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
      model: this.configService.get<string>('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small',
      dimensions: this.configService.get<number>('OPENAI_EMBEDDING_DIMENSION') || 1536,
    });

    // Ollama（本地部署）
    this.defaultConfigs.set('ollama', {
      apiKey: 'ollama', // Ollama 不需要 API Key
      baseUrl: this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434',
      model: this.configService.get<string>('OLLAMA_EMBEDDING_MODEL') || 'nomic-embed-text',
      dimensions: this.configService.get<number>('OLLAMA_EMBEDDING_DIMENSION') || 768,
    });

    this.logger.log(
      `Loaded default configs for: ${[...this.defaultConfigs.keys()].join(', ')}`,
    );
  }
}
