/**
 * 缓存装饰器 — 基于 CacheService 多级缓存
 *
 * Phase 2.4 增强:
 * - @Cacheable: L1 LRU + L2 Redis 联动缓存
 * - @CacheEvict: 同时失效 L1 + L2
 * - @CachePrefix: 按前缀批量失效
 * - 支持 CacheService 互斥锁防击穿
 * - TTL 抖动防雪崩
 * - 空值缓存防穿透
 *
 * 竞品对标:
 * - Dify: @cacheable 装饰器 + Redis 单层
 * - Spring Cache: @Cacheable/@CacheEvict 注解
 * - 本设计: 多级缓存装饰器 + 互斥锁 + TTL 策略
 */
import { SetMetadata } from '@nestjs/common';

/**
 * 缓存装饰器元数据键
 */
export const CACHE_KEY = 'cache:key';
export const CACHE_TTL = 'cache:ttl';

/**
 * 缓存装饰器 — 标记方法返回值需要缓存（L1 + L2）
 *
 * 用法:
 * @Cacheable('knowledge_bases', 300) // 缓存 5 分钟
 * async findKnowledgeBases(userId: string) { ... }
 *
 * 缓存键构建: {prefix}:{args_hash}
 * 例: knowledge_bases:"user123"
 *
 * Phase 2.4 增强:
 * - 使用 CacheService 多级缓存替代仅 Redis 缓存
 * - 互斥锁防击穿
 * - 空值缓存防穿透
 * - TTL 抖动防雪崩
 *
 * 竞品对标:
 * - Dify: 使用 @cacheable 装饰器 + Redis 后端
 * - Spring Cache: @Cacheable 注解
 */
export function Cacheable(key: string, ttlSeconds: number = 300) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(CACHE_KEY, key, descriptor.value);
    Reflect.defineMetadata(CACHE_TTL, ttlSeconds, descriptor.value);

    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // 优先使用 CacheService（多级缓存）
      const cacheService = this.cacheService || this._cacheService;

      if (cacheService) {
        // 构建缓存键: key:arg1:arg2:...
        const cacheKey = `${key}:${args.map(a => {
          if (a === null) return 'null';
          if (a === undefined) return 'undefined';
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch { return String(a); }
          }
          return String(a);
        }).join(':')}`;

        try {
          return await cacheService.getOrSet(cacheKey, () => originalMethod.apply(this, args), ttlSeconds);
        } catch (error) {
          // CacheService 异常降级：直接执行原方法
          return originalMethod.apply(this, args);
        }
      }

      // 降级到 RedisService（如果 CacheService 不可用）
      const redisService = this.redisService || this._redisService;

      if (!redisService) {
        // Redis 也不可用，直接执行原方法
        return originalMethod.apply(this, args);
      }

      // 构建缓存键: key:arg1:arg2:...
      const cacheKey = `${key}:${args.map(a => JSON.stringify(a)).join(':')}`;

      try {
        // 先查缓存
        const cached = await redisService.getCached(cacheKey);
        if (cached !== null) {
          return cached;
        }

        // 缓存未命中，执行原方法
        const result = await originalMethod.apply(this, args);

        // 写入缓存
        await redisService.setCached(cacheKey, result, ttlSeconds);

        return result;
      } catch (error) {
        // Redis 异常降级：直接执行原方法
        return originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

/**
 * 缓存失效装饰器 — 标记方法执行后清除指定缓存（L1 + L2）
 *
 * 用法:
 * @CacheEvict('knowledge_bases')
 * async createKnowledgeBase() { ... }
 *
 * Phase 2.4 增强:
 * - 同时失效 L1 内存缓存和 L2 Redis 缓存
 * - 使用 SCAN 替代 KEYS（生产安全）
 */
export function CacheEvict(key: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // 优先使用 CacheService
      const cacheService = this.cacheService || this._cacheService;
      if (cacheService) {
        try {
          await cacheService.deleteByPrefix(key);
        } catch (error) {
          // 缓存清除失败不影响业务
        }
        return result;
      }

      // 降级到 RedisService
      const redisService = this.redisService || this._redisService;
      if (redisService) {
        try {
          // 使用 SCAN 替代 KEYS（生产安全）
          const client = redisService.getClient();
          let cursor = '0';
          do {
            const scanResult = await client.scan(cursor, 'MATCH', `${key}:*`, 'COUNT', 100);
            cursor = scanResult[0];
            const keys = scanResult[1];
            if (keys.length > 0) {
              await client.del(...keys);
            }
          } while (cursor !== '0');
        } catch (error) {
          // Redis 异常降级：忽略缓存清除失败
        }
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * 缓存 TTL 常量 — 参考竞品策略
 *
 * 设计原则:
 * - L1 TTL = L2 TTL × 0.2（确保 L1 先过期，L2 兜底）
 * - 热点数据（列表）TTL 短，详情数据 TTL 长
 * - 模型配置等低频变更数据 TTL 更长
 *
 * 竞品对标:
 * - Dify: 知识库列表 5min, 用户信息 30min
 * - FastGPT: API 缓存 5min, 模型配置 1h
 * - 本设计: 分层 TTL + L1/L2 差异化过期
 */
export const CacheTTL = {
  /** 知识库列表: 5 分钟 */
  KNOWLEDGE_BASES: 300,
  /** 知识库详情: 10 分钟 */
  KNOWLEDGE_BASE_DETAIL: 600,
  /** 知识库检索结果: 2 分钟（检索结果变化较快） */
  KNOWLEDGE_BASE_RETRIEVAL: 120,
  /** 工作流配置: 10 分钟 */
  WORKFLOW_CONFIG: 600,
  /** 工作流列表: 5 分钟 */
  WORKFLOW_LIST: 300,
  /** 用户信息: 30 分钟 */
  USER_PROFILE: 1800,
  /** 应用列表: 5 分钟 */
  APPLICATIONS: 300,
  /** 模型配置: 1 小时（低频变更） */
  MODEL_CONFIG: 3600,
  /** API 限流计数: 1 分钟 */
  RATE_LIMIT: 60,
  /** Embedding 向量: 30 分钟（向量结果相对稳定） */
  EMBEDDING_RESULT: 1800,
  /** 文档分块: 15 分钟 */
  DOCUMENT_CHUNKS: 900,
} as const;

/**
 * 缓存键前缀常量
 *
 * 规范: {业务域}:{操作}
 * 便于按前缀批量失效
 */
export const CachePrefix = {
  /** 知识库 */
  KNOWLEDGE_BASE: 'kb',
  /** 知识库检索 */
  KNOWLEDGE_BASE_RETRIEVAL: 'kb:retrieve',
  /** 工作流 */
  WORKFLOW: 'wf',
  /** 用户 */
  USER: 'user',
  /** 应用 */
  APP: 'app',
  /** 模型 */
  MODEL: 'model',
  /** Embedding */
  EMBEDDING: 'emb',
  /** 文档 */
  DOCUMENT: 'doc',
} as const;
