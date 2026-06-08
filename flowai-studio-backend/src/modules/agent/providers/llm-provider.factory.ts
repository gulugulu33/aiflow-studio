/**
 * LLM Provider Factory
 *
 * 工厂 + 注册表模式，按需创建 LLM Provider。
 * 与 RerankerFactory / VectorStoreFactory 保持一致的设计风格。
 *
 * 核心能力:
 * - 注册/创建 5 大主流 Provider（OpenAI/Claude/Gemini/Qwen/Ollama）
 * - 根据 model ID 自动路由到对应 Provider
 * - 实例缓存避免重复创建
 * - 模型能力查询
 * - 健康检查
 * - Token 用量与成本估算
 *
 * 竞品对标:
 * - Dify: 支持 15+ Provider，但硬编码不可扩展
 * - LangChain: 50+ Provider，但配置分散
 * - 本设计: 注册表模式 + 自动路由 + 统一接口，易于扩展新 Provider
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ILLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  LLMModelInfo,
} from '../interfaces/llm-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { ClaudeProvider } from './claude.provider';
import { GeminiProvider } from './gemini.provider';
import { QwenProvider } from './qwen.provider';
import { OllamaProvider } from './ollama.provider';

interface LLMProviderRegistryEntry {
  type: LLMProviderType;
  factory: (config: LLMProviderConfig) => ILLMProvider;
  description: string;
}

@Injectable()
export class LLMProviderFactory {
  private readonly logger = new Logger(LLMProviderFactory.name);

  /** 已注册的 Provider 工厂 */
  private readonly registry = new Map<LLMProviderType, LLMProviderRegistryEntry>();

  /** 运行时缓存：避免重复创建相同配置的实例 */
  private readonly instances = new Map<LLMProviderType, ILLMProvider>();

  /** 模型 → Provider 的路由表 */
  private modelRouteMap = new Map<string, LLMProviderType>();

  constructor(private readonly configService: ConfigService) {
    this.registerDefaults();
    this.buildModelRouteMap();
  }

  /**
   * 注册内置 LLM Provider
   */
  private registerDefaults(): void {
    this.register('openai', {
      type: 'openai',
      factory: (config) => new OpenAIProvider(config),
      description: 'OpenAI GPT-4o/GPT-4o-mini/GPT-3.5 — 行业标杆，Function Calling 最强',
    });

    this.register('claude', {
      type: 'claude',
      factory: (config) => new ClaudeProvider(config),
      description: 'Anthropic Claude 3.5 Sonnet/Opus/Haiku — 长上下文、推理强、安全对齐',
    });

    this.register('gemini', {
      type: 'gemini',
      factory: (config) => new GeminiProvider(config),
      description: 'Google Gemini 1.5 Pro/Flash — 100 万 tokens 上下文、多模态',
    });

    this.register('qwen', {
      type: 'qwen',
      factory: (config) => new QwenProvider(config),
      description: '通义千问 Qwen Turbo/Plus/Max — 国内首选、性价比高、中文强',
    });

    this.register('ollama', {
      type: 'ollama',
      factory: (config) => new OllamaProvider(config),
      description: 'Ollama 本地模型 — 零 API 成本、数据不离开服务器、支持 Llama/Mistral/Qwen2',
    });
  }

  /**
   * 注册自定义 LLM Provider（供第三方扩展）
   */
  register(type: LLMProviderType, entry: LLMProviderRegistryEntry): void {
    this.registry.set(type, entry);
    this.logger.log(`Registered LLM provider: ${type} — ${entry.description}`);
  }

  /**
   * 根据 Provider 类型创建实例
   */
  create(
    providerType: LLMProviderType,
    overrides?: Partial<LLMProviderConfig>,
  ): ILLMProvider {
    // 缓存命中
    const cached = this.instances.get(providerType);
    if (cached && !overrides) return cached;

    const entry = this.registry.get(providerType);
    if (!entry) {
      this.logger.warn(`Unknown LLM provider: ${providerType}, falling back to qwen`);
      return this.create('qwen');
    }

    // 合并配置：环境变量默认值 + 调用方覆盖
    const config = this.buildConfig(providerType, overrides);
    const instance = entry.factory(config);

    // 无覆盖时缓存
    if (!overrides) {
      this.instances.set(providerType, instance);
    }

    this.logger.log(`Created LLM provider: ${providerType} (default model: ${instance.defaultModel})`);
    return instance;
  }

  /**
   * 根据 model ID 自动路由到对应 Provider
   *
   * 例如: gpt-4o → openai, claude-3-5-sonnet → claude
   */
  getProviderForModel(modelId: string): ILLMProvider {
    const providerType = this.modelRouteMap.get(modelId);
    if (providerType) {
      return this.create(providerType);
    }

    // 模糊匹配：通过模型名前缀推断
    if (modelId.startsWith('gpt-')) return this.create('openai');
    if (modelId.startsWith('claude-')) return this.create('claude');
    if (modelId.startsWith('gemini-')) return this.create('gemini');
    if (modelId.startsWith('qwen-') || modelId.startsWith('qwen2')) return this.create('qwen');

    // 默认使用 Qwen
    this.logger.warn(`Unknown model: ${modelId}, routing to qwen provider`);
    return this.create('qwen');
  }

  /**
   * 获取所有已注册的 Provider 类型
   */
  getRegisteredTypes(): Array<{ type: LLMProviderType; description: string }> {
    return Array.from(this.registry.entries()).map(([type, entry]) => ({
      type,
      description: entry.description,
    }));
  }

  /**
   * 获取所有可用模型（所有 Provider 的合并列表）
   */
  getAllModels(): LLMModelInfo[] {
    const models: LLMModelInfo[] = [];
    for (const [type] of this.registry) {
      try {
        const provider = this.create(type);
        models.push(...provider.supportedModels);
      } catch {
        // Provider 创建失败则跳过
      }
    }
    return models.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  /**
   * 按 Provider 分组获取模型
   */
  getModelsGroupByProvider(): Record<string, LLMModelInfo[]> {
    const groups: Record<string, LLMModelInfo[]> = {};
    for (const [type] of this.registry) {
      try {
        const provider = this.create(type);
        groups[type] = provider.supportedModels;
      } catch {
        groups[type] = [];
      }
    }
    return groups;
  }

  /**
   * 获取模型信息
   */
  getModelInfo(modelId: string): LLMModelInfo | undefined {
    const provider = this.getProviderForModel(modelId);
    return provider.supportedModels.find((m) => m.id === modelId);
  }

  /**
   * 健康检查所有 Provider
   */
  async healthCheckAll(): Promise<Record<LLMProviderType, { available: boolean; models: number }>> {
    const results: Record<string, { available: boolean; models: number }> = {};

    for (const [type] of this.registry) {
      try {
        const provider = this.create(type);
        const available = await provider.healthCheck();
        results[type] = { available, models: provider.supportedModels.length };
      } catch {
        results[type] = { available: false, models: 0 };
      }
    }

    return results as Record<LLMProviderType, { available: boolean; models: number }>;
  }

  /**
   * 估算 Token 成本
   */
  estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
    const modelInfo = this.getModelInfo(modelId);
    if (!modelInfo?.inputPricePer1M || !modelInfo?.outputPricePer1M) return 0;

    const inputCost = (promptTokens / 1_000_000) * modelInfo.inputPricePer1M;
    const outputCost = (completionTokens / 1_000_000) * modelInfo.outputPricePer1M;
    return inputCost + outputCost;
  }

  /**
   * 清除缓存实例（用于配置更新后重建）
   */
  clearCache(): void {
    this.instances.clear();
    this.logger.log('LLM provider instance cache cleared');
  }

  /**
   * 构建 Provider 配置
   */
  private buildConfig(
    providerType: LLMProviderType,
    overrides?: Partial<LLMProviderConfig>,
  ): LLMProviderConfig {
    const defaults: Record<string, Partial<LLMProviderConfig>> = {
      openai: {
        apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
        baseUrl: this.configService.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
        timeout: 60000,
        extra: {
          organization: this.configService.get<string>('OPENAI_ORGANIZATION', ''),
        },
      },
      claude: {
        apiKey: this.configService.get<string>('ANTHROPIC_API_KEY', ''),
        baseUrl: this.configService.get<string>('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
        timeout: 60000,
        extra: {
          anthropicVersion: this.configService.get<string>('ANTHROPIC_VERSION', '2023-06-01'),
        },
      },
      gemini: {
        apiKey: this.configService.get<string>('GOOGLE_API_KEY', ''),
        baseUrl: this.configService.get<string>('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
        timeout: 60000,
      },
      qwen: {
        apiKey: this.configService.get<string>('QWEN_API_KEY', ''),
        baseUrl: this.configService.get<string>('QWEN_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
        timeout: 60000,
      },
      ollama: {
        baseUrl: this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434'),
        timeout: 120000, // 本地推理可能更慢
      },
    };

    return {
      ...(defaults[providerType] || {}),
      ...overrides,
    } as LLMProviderConfig;
  }

  /**
   * 构建模型路由表
   * 为每个 Provider 的每个模型建立 model ID → provider type 的映射
   */
  private buildModelRouteMap(): void {
    for (const [type] of this.registry) {
      try {
        const config = this.buildConfig(type);
        const entry = this.registry.get(type);
        if (entry) {
          const instance = entry.factory(config);
          for (const model of instance.supportedModels) {
            this.modelRouteMap.set(model.id, type);
          }
        }
      } catch {
        // 构建路由失败则跳过
      }
    }
  }
}
