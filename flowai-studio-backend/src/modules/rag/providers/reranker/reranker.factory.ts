/**
 * Reranker Factory
 *
 * 工厂 + 注册表模式，按知识库配置动态创建 Reranker Provider。
 * 与 EmbeddingFactory / VectorStoreFactory 保持一致的设计风格。
 *
 * 竞品对标:
 * - Dify: 仅支持 Cohere Rerank，不支持本地模型
 * - FastGPT: 仅支持 Cohere Rerank
 * - Flowise: 支持 HuggingFace + Cohere
 * - 本设计: Cohere + Ollama 本地（可扩展），注册表模式便于第三方扩展
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RerankerProvider,
  RerankerProviderConfig,
  RerankRequest,
} from '../../interfaces/reranker-provider.interface';
import { CohereReranker } from './cohere-reranker.provider';
import { OllamaReranker } from './ollama-reranker.provider';

export type RerankerType = 'cohere' | 'ollama' | 'none';

interface RerankerRegistryEntry {
  type: RerankerType;
  factory: (config: RerankerProviderConfig) => RerankerProvider;
  description: string;
}

@Injectable()
export class RerankerFactory {
  private readonly logger = new Logger(RerankerFactory.name);

  /** 已注册的 Reranker Provider 工厂 */
  private readonly registry = new Map<RerankerType, RerankerRegistryEntry>();

  /** 运行时缓存：避免重复创建相同配置的实例 */
  private readonly instances = new Map<string, RerankerProvider>();

  constructor(private readonly configService: ConfigService) {
    this.registerDefaults();
  }

  /**
   * 注册内置 Reranker Provider
   */
  private registerDefaults(): void {
    this.register('cohere', {
      type: 'cohere',
      factory: (config) => new CohereReranker(config),
      description: 'Cohere Rerank API — 业界最强重排序 API，支持多语言',
    });

    this.register('ollama', {
      type: 'ollama',
      factory: (config) => new OllamaReranker(config),
      description: 'Ollama 本地 Reranker — bge-reranker-v2-m3 等，零 API 成本，数据不离开服务器',
    });

    this.register('none', {
      type: 'none',
      factory: () => new NoOpReranker(),
      description: '不使用重排序',
    });
  }

  /**
   * 注册自定义 Reranker Provider（供第三方扩展）
   */
  register(type: RerankerType, entry: RerankerRegistryEntry): void {
    this.registry.set(type, entry);
    this.logger.log(`Registered reranker provider: ${type} — ${entry.description}`);
  }

  /**
   * 根据 KnowledgeBase 配置创建 Reranker Provider
   */
  create(
    rerankerType: RerankerType,
    overrides?: Partial<RerankerProviderConfig>,
  ): RerankerProvider {
    const cacheKey = this.buildCacheKey(rerankerType, overrides);

    // 缓存命中
    const cached = this.instances.get(cacheKey);
    if (cached) return cached;

    // "none" 类型直接返回 NoOp
    if (rerankerType === 'none') {
      const instance = new NoOpReranker();
      this.instances.set(cacheKey, instance);
      return instance;
    }

    const entry = this.registry.get(rerankerType);
    if (!entry) {
      this.logger.warn(`Unknown reranker type: ${rerankerType}, falling back to none`);
      return new NoOpReranker();
    }

    // 合并配置：环境变量默认值 + 调用方覆盖
    const config = this.buildConfig(rerankerType, overrides);
    const instance = entry.factory(config);

    this.instances.set(cacheKey, instance);
    this.logger.log(`Created reranker provider: ${rerankerType} (model: ${instance.getModel()})`);

    return instance;
  }

  /**
   * 获取所有已注册的 Reranker 类型
   */
  getRegisteredTypes(): Array<{ type: RerankerType; description: string }> {
    return Array.from(this.registry.entries()).map(([type, entry]) => ({
      type,
      description: entry.description,
    }));
  }

  /**
   * 清除缓存实例（用于配置更新后重建）
   */
  clearCache(): void {
    this.instances.clear();
    this.logger.log('Reranker instance cache cleared');
  }

  /**
   * 健康检查所有已注册的 Reranker
   */
  async healthCheckAll(): Promise<Record<RerankerType, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [type] of this.registry) {
      if (type === 'none') {
        results[type] = true;
        continue;
      }
      try {
        const instance = this.create(type);
        results[type] = await instance.healthCheck();
      } catch {
        results[type] = false;
      }
    }

    return results as Record<RerankerType, boolean>;
  }

  /**
   * 构建配置
   */
  private buildConfig(
    rerankerType: RerankerType,
    overrides?: Partial<RerankerProviderConfig>,
  ): RerankerProviderConfig {
    const defaults: Record<string, Partial<RerankerProviderConfig>> = {
      cohere: {
        apiKey: this.configService.get<string>('COHERE_API_KEY', ''),
        baseUrl: this.configService.get<string>('COHERE_BASE_URL', 'https://api.cohere.com'),
        model: this.configService.get<string>('COHERE_RERANK_MODEL', 'rerank-v3.5'),
        timeout: 30000,
        maxConcurrency: 5,
      },
      ollama: {
        baseUrl: this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434'),
        model: this.configService.get<string>('OLLAMA_RERANK_MODEL', 'bge-reranker-v2-m3'),
        timeout: 60000,
        maxConcurrency: 3,
      },
      none: {},
    };

    return {
      ...(defaults[rerankerType] || {}),
      ...overrides,
    } as RerankerProviderConfig;
  }

  /**
   * 构建缓存 Key
   */
  private buildCacheKey(type: RerankerType, overrides?: Partial<RerankerProviderConfig>): string {
    const key = `reranker:${type}`;
    if (!overrides) return key;

    // 使用模型和 baseUrl 作为缓存维度
    const parts = [key];
    if (overrides.model) parts.push(`model:${overrides.model}`);
    if (overrides.baseUrl) parts.push(`url:${overrides.baseUrl}`);

    return parts.join('|');
  }
}

/**
 * NoOp Reranker — 不做任何重排序，原样返回
 */
class NoOpReranker implements RerankerProvider {
  async rerank(request: RerankRequest) {
    return {
      results: request.documents.map((doc, index) => ({
        id: doc.id,
        content: doc.content,
        relevanceScore: doc.originalScore || 1 - index / Math.max(request.documents.length, 1),
        originalScore: doc.originalScore,
        metadata: doc.metadata,
      })),
      model: 'none',
    };
  }

  getModel(): string {
    return 'none';
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
