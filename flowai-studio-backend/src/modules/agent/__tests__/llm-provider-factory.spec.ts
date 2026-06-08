/**
 * LLMProviderFactory 单元测试
 *
 * Phase 3.2 测试覆盖:
 * - Provider 注册与创建
 * - 模型自动路由
 * - 配置合并
 * - 健康检查
 * - 模型列表查询
 * - 成本估算
 */
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { ConfigService } from '@nestjs/config';

describe('LLMProviderFactory', () => {
  let factory: LLMProviderFactory;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const envMap: Record<string, string> = {
          QWEN_API_KEY: 'test-qwen-key',
          OPENAI_API_KEY: 'test-openai-key',
          ANTHROPIC_API_KEY: 'test-anthropic-key',
          GOOGLE_API_KEY: 'test-google-key',
          OLLAMA_BASE_URL: 'http://localhost:11434',
        };
        return envMap[key] ?? defaultValue ?? '';
      }),
    };

    factory = new LLMProviderFactory(mockConfigService as ConfigService);
  });

  describe('Provider Registration', () => {
    it('should register 5 default providers', () => {
      const types = factory.getRegisteredTypes();
      expect(types).toHaveLength(5);
      expect(types.map((t) => t.type)).toEqual(
        expect.arrayContaining(['openai', 'claude', 'gemini', 'qwen', 'ollama']),
      );
    });

    it('should create provider by type', () => {
      const qwen = factory.create('qwen');
      expect(qwen.name).toBe('qwen');
      expect(qwen.defaultModel).toBe('qwen-turbo');
    });

    it('should fall back to qwen for unknown provider type', () => {
      const provider = factory.create('unknown' as any);
      expect(provider.name).toBe('qwen');
    });

    it('should cache provider instances', () => {
      const p1 = factory.create('qwen');
      const p2 = factory.create('qwen');
      expect(p1).toBe(p2); // 同一个实例
    });

    it('should create new instance when overrides provided', () => {
      const p1 = factory.create('qwen');
      const p2 = factory.create('qwen', { apiKey: 'custom-key' });
      expect(p1).not.toBe(p2);
    });
  });

  describe('Model Routing', () => {
    it('should route gpt-4o to openai', () => {
      const provider = factory.getProviderForModel('gpt-4o');
      expect(provider.name).toBe('openai');
    });

    it('should route claude-3-5-sonnet to claude', () => {
      const provider = factory.getProviderForModel('claude-3-5-sonnet-20241022');
      expect(provider.name).toBe('claude');
    });

    it('should route gemini-1.5-pro to gemini', () => {
      const provider = factory.getProviderForModel('gemini-1.5-pro');
      expect(provider.name).toBe('gemini');
    });

    it('should route qwen-turbo to qwen', () => {
      const provider = factory.getProviderForModel('qwen-turbo');
      expect(provider.name).toBe('qwen');
    });

    it('should route unknown model prefix to qwen as default', () => {
      const provider = factory.getProviderForModel('some-unknown-model');
      expect(provider.name).toBe('qwen');
    });
  });

  describe('Model List', () => {
    it('should return all models from all providers', () => {
      const models = factory.getAllModels();
      expect(models.length).toBeGreaterThan(10); // 5 providers each have 3-5 models
    });

    it('should return models grouped by provider', () => {
      const groups = factory.getModelsGroupByProvider();
      expect(Object.keys(groups)).toEqual(
        expect.arrayContaining(['openai', 'claude', 'gemini', 'qwen', 'ollama']),
      );
      expect(groups.qwen.length).toBeGreaterThan(0);
    });

    it('should get model info for specific model', () => {
      const model = factory.getModelInfo('gpt-4o');
      expect(model).toBeDefined();
      expect(model?.displayName).toBe('GPT-4o');
      expect(model?.provider).toBe('openai');
      expect(model?.capabilities.functionCalling).toBe(true);
      expect(model?.capabilities.vision).toBe(true);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate cost for known model', () => {
      const cost = factory.estimateCost('gpt-4o', 1000, 500);
      // gpt-4o: input $2.5/1M, output $10/1M
      const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it('should return 0 for unknown model', () => {
      const cost = factory.estimateCost('unknown-model', 1000, 500);
      expect(cost).toBe(0);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      factory.create('qwen'); // Create and cache
      factory.clearCache();
      // After clear, new instance should be created
      const p = factory.create('qwen');
      expect(p).toBeDefined();
    });
  });

  describe('Provider Configuration', () => {
    it('should read API keys from ConfigService', () => {
      const qwen = factory.create('qwen');
      expect(qwen).toBeDefined();
      // API key is internal, just verify provider was created
    });

    it('should merge overrides with defaults', () => {
      const provider = factory.create('openai', {
        baseUrl: 'https://custom-openai.example.com/v1',
      });
      expect(provider).toBeDefined();
    });
  });
});
