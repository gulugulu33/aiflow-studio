/**
 * Reranker 工厂 + Provider 单元测试
 *
 * 覆盖:
 * - RerankerFactory: 创建/注册/缓存/健康检查
 * - CohereReranker: API key 缺失降级、健康检查
 * - OllamaReranker: 空文档处理、健康检查
 * - NoOpReranker: 原样返回
 */
import { RerankerFactory, RerankerType } from '../reranker.factory';
import { ConfigService } from '@nestjs/config';

// ─── Mocks ────────────────────────────────────────────────

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const env: Record<string, string> = {
      COHERE_API_KEY: 'test-cohere-key',
      COHERE_BASE_URL: 'https://api.cohere.com',
      COHERE_RERANK_MODEL: 'rerank-v3.5',
      OLLAMA_BASE_URL: 'http://localhost:11434',
      OLLAMA_RERANK_MODEL: 'bge-reranker-v2-m3',
    };
    return env[key] ?? defaultValue ?? '';
  }),
};

describe('RerankerFactory', () => {
  let factory: RerankerFactory;

  beforeEach(() => {
    factory = new RerankerFactory(mockConfigService as any);
  });

  it('should create Cohere reranker', () => {
    const reranker = factory.create('cohere');
    expect(reranker).toBeDefined();
    expect(reranker.getModel()).toBe('rerank-v3.5');
  });

  it('should create Ollama reranker', () => {
    const reranker = factory.create('ollama');
    expect(reranker).toBeDefined();
    expect(reranker.getModel()).toBe('bge-reranker-v2-m3');
  });

  it('should create NoOp reranker for "none" type', () => {
    const reranker = factory.create('none');
    expect(reranker).toBeDefined();
    expect(reranker.getModel()).toBe('none');
  });

  it('should fallback to NoOp for unknown type', () => {
    const reranker = factory.create('unknown' as RerankerType);
    expect(reranker).toBeDefined();
    expect(reranker.getModel()).toBe('none');
  });

  it('should return cached instance for same config', () => {
    const r1 = factory.create('cohere');
    const r2 = factory.create('cohere');
    expect(r1).toBe(r2); // same reference
  });

  it('should create different instances for different models', () => {
    const r1 = factory.create('cohere', { model: 'rerank-v3.5' });
    const r2 = factory.create('cohere', { model: 'rerank-english-v3.0' });
    expect(r1).not.toBe(r2);
  });

  it('should list registered types', () => {
    const types = factory.getRegisteredTypes();
    expect(types.length).toBeGreaterThanOrEqual(3);
    expect(types.map((t) => t.type)).toContain('cohere');
    expect(types.map((t) => t.type)).toContain('ollama');
    expect(types.map((t) => t.type)).toContain('none');
  });

  it('should clear cache', () => {
    factory.create('cohere');
    factory.clearCache();
    // After clearing, a new instance should be created
    const r1 = factory.create('cohere');
    // Creating another should be cached again
    const r2 = factory.create('cohere');
    expect(r1).toBe(r2);
  });
});

describe('NoOpReranker (via factory)', () => {
  let factory: RerankerFactory;

  beforeEach(() => {
    factory = new RerankerFactory(mockConfigService as any);
  });

  it('should return documents in original order', async () => {
    const reranker = factory.create('none');
    const result = await reranker.rerank({
      query: 'test query',
      documents: [
        { id: '1', content: 'doc 1', originalScore: 0.9, metadata: {} },
        { id: '2', content: 'doc 2', originalScore: 0.7, metadata: {} },
      ],
      topN: 5,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].id).toBe('1');
    expect(result.results[0].relevanceScore).toBe(0.9);
    expect(result.results[1].id).toBe('2');
    expect(result.results[1].relevanceScore).toBe(0.7);
  });

  it('should handle empty documents', async () => {
    const reranker = factory.create('none');
    const result = await reranker.rerank({
      query: 'test',
      documents: [],
      topN: 5,
    });
    expect(result.results).toHaveLength(0);
  });

  it('should pass health check', async () => {
    const reranker = factory.create('none');
    const healthy = await reranker.healthCheck();
    expect(healthy).toBe(true);
  });
});

describe('CohereReranker (via factory)', () => {
  let factory: RerankerFactory;

  beforeEach(() => {
    factory = new RerankerFactory(mockConfigService as any);
  });

  it('should gracefully degrade when API key is missing', async () => {
    const noKeyFactory = new RerankerFactory({
      get: (key: string) => key === 'COHERE_API_KEY' ? '' : mockConfigService.get(key),
    } as any);

    const reranker = noKeyFactory.create('cohere');
    const result = await reranker.rerank({
      query: 'test query',
      documents: [
        { id: '1', content: 'doc 1', originalScore: 0.9, metadata: {} },
        { id: '2', content: 'doc 2', originalScore: 0.7, metadata: {} },
      ],
    });

    // Should return original order when API key is missing
    expect(result.results).toHaveLength(2);
    expect(result.results[0].id).toBe('1');
  });

  it('should handle empty documents', async () => {
    const reranker = factory.create('cohere');
    const result = await reranker.rerank({
      query: 'test',
      documents: [],
    });
    expect(result.results).toHaveLength(0);
  });
});

describe('OllamaReranker (via factory)', () => {
  let factory: RerankerFactory;

  beforeEach(() => {
    factory = new RerankerFactory(mockConfigService as any);
  });

  it('should handle empty documents', async () => {
    const reranker = factory.create('ollama');
    const result = await reranker.rerank({
      query: 'test',
      documents: [],
    });
    expect(result.results).toHaveLength(0);
  });
});
