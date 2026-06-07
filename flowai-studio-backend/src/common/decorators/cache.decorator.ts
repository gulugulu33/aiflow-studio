import { SetMetadata } from '@nestjs/common';

/**
 * 缓存装饰器元数据键
 */
export const CACHE_KEY = 'cache:key';
export const CACHE_TTL = 'cache:ttl';

/**
 * 缓存装饰器 — 标记方法返回值需要缓存
 *
 * 用法:
 * @Cacheable('knowledge_bases', 300) // 缓存 5 分钟
 * async findKnowledgeBases() { ... }
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
      // 尝试获取 RedisService（如果可用）
      const redisService = this.redisService || this._redisService;

      if (!redisService) {
        // Redis 不可用，直接执行原方法
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
 * 缓存失效装饰器 — 标记方法执行后清除指定缓存
 *
 * 用法:
 * @CacheEvict('knowledge_bases')
 * async createKnowledgeBase() { ... }
 */
export function CacheEvict(key: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      const redisService = this.redisService || this._redisService;
      if (redisService) {
        try {
          // 清除所有匹配的缓存键
          const client = redisService.getClient();
          const keys = await client.keys(`${key}:*`);
          if (keys.length > 0) {
            await client.del(...keys);
          }
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
 */
export const CacheTTL = {
  /** 知识库列表: 5 分钟 */
  KNOWLEDGE_BASES: 300,
  /** 知识库详情: 10 分钟 */
  KNOWLEDGE_BASE_DETAIL: 600,
  /** 工作流配置: 10 分钟 */
  WORKFLOW_CONFIG: 600,
  /** 用户信息: 30 分钟 */
  USER_PROFILE: 1800,
  /** 应用列表: 5 分钟 */
  APPLICATIONS: 300,
  /** 模型配置: 1 小时 */
  MODEL_CONFIG: 3600,
  /** API 限流计数: 1 分钟 */
  RATE_LIMIT: 60,
} as const;
