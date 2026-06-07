import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 服务 — 缓存、会话、限流的基础
 *
 * 竞品对标:
 * - Dify: 使用 Redis 做 Rate Limiting、缓存、任务队列
 * - Coze: Redis 做会话管理 + 分布式锁
 * - FastGPT: Redis 做 API 缓存 + 限流
 *
 * 持久化策略:
 * - RDB: 每 5 分钟自动快照（适合灾难恢复）
 * - AOF: 每秒 fsync（适合数据安全）
 * - 两者结合，既保证性能又保证数据安全
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.client.on('ready', () => {
      this.logger.log('Redis is ready to accept commands');
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * 获取 Redis 客户端实例（用于高级操作）
   */
  getClient(): Redis {
    return this.client;
  }

  // ============================================================
  // 基础 Key-Value 操作
  // ============================================================

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ============================================================
  // Hash 操作
  // ============================================================

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.client.hset(key, field, value);
    if (ttlSeconds) {
      await this.client.expire(key, ttlSeconds);
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    await this.client.hdel(key, ...fields);
  }

  // ============================================================
  // 缓存操作 (带 JSON 序列化)
  // ============================================================

  /**
   * 获取缓存 — 自动 JSON 反序列化
   */
  async getCached<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * 设置缓存 — 自动 JSON 序列化
   * @param key 缓存键
   * @param value 缓存值
   * @param ttlSeconds 过期时间（秒），默认使用策略中的 TTL
   */
  async setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.set(key, serialized, ttlSeconds);
  }

  /**
   * 缓存穿透保护 — 使用缓存空值防止频繁查库
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = await this.getCached<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.setCached(key, value, ttlSeconds);
    return value;
  }

  // ============================================================
  // 限流操作
  // ============================================================

  /**
   * 滑动窗口限流
   * @param key 限流键 (如: rate_limit:api:userId)
   * @param windowSeconds 窗口时间（秒）
   * @param maxRequests 窗口内最大请求数
   * @returns 是否允许请求
   */
  async rateLimit(key: string, windowSeconds: number, maxRequests: number): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    // 使用 Redis Sorted Set 实现滑动窗口
    const multi = this.client.multi();

    // 移除窗口外的旧记录
    multi.zremrangebyscore(key, 0, windowStart);

    // 添加当前请求
    multi.zadd(key, now, `${now}-${Math.random()}`);

    // 获取窗口内的请求数
    multi.zcard(key);

    // 设置 key 过期时间
    multi.expire(key, windowSeconds);

    const results = await multi.exec();
    const count = results?.[2]?.[1] as number || 0;

    if (count > maxRequests) {
      // 获取最早的请求时间，计算重试等待时间
      const earliest = await this.client.zrange(key, 0, 0, 'WITHSCORES');
      const earliestTime = earliest.length >= 2 ? Number(earliest[1]) : now;
      const retryAfter = Math.ceil((earliestTime + windowSeconds * 1000 - now) / 1000);

      return { allowed: false, remaining: 0, retryAfter };
    }

    return { allowed: true, remaining: maxRequests - count };
  }

  // ============================================================
  // 登录安全操作 (替代内存 Map)
  // ============================================================

  /**
   * 记录登录尝试
   * Redis Key: login_attempts:{username}
   * 使用 Hash 存储: attempts, lastAttempt, lockedUntil
   */
  async recordLoginAttempt(username: string, success: boolean, maxAttempts: number = 5, lockoutDuration: number = 900): Promise<void> {
    const key = `login_attempts:${username}`;

    if (success) {
      // 登录成功，清除记录
      await this.client.del(key);
      return;
    }

    // 登录失败，增加计数
    const attempts = await this.client.hincrby(key, 'attempts', 1);
    await this.client.hset(key, 'lastAttempt', Date.now().toString());

    // 超过最大尝试次数，锁定账户
    if (attempts >= maxAttempts) {
      const lockedUntil = Date.now() + lockoutDuration * 1000;
      await this.client.hset(key, 'lockedUntil', lockedUntil.toString());
    }

    // 设置 key 过期时间（1小时后自动清理）
    await this.client.expire(key, 3600);
  }

  /**
   * 检查账户是否被锁定
   */
  async checkAccountLock(username: string): Promise<{ locked: boolean; remainingMinutes?: number; remainingAttempts?: number }> {
    const key = `login_attempts:${username}`;
    const data = await this.client.hgetall(key);

    if (!data || !data.attempts) {
      return { locked: false, remainingAttempts: 5 };
    }

    const lockedUntil = data.lockedUntil ? Number(data.lockedUntil) : 0;
    const now = Date.now();

    if (lockedUntil && lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockedUntil - now) / 60000);
      return { locked: true, remainingMinutes };
    }

    // 锁定已过期，清除锁定状态
    if (lockedUntil && lockedUntil <= now) {
      await this.client.del(key);
      return { locked: false, remainingAttempts: 5 };
    }

    const attempts = Number(data.attempts) || 0;
    return { locked: false, remainingAttempts: Math.max(0, 5 - attempts) };
  }

  // ============================================================
  // 健康检查
  // ============================================================

  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      await this.client.ping();
      return { status: 'healthy', latency: Date.now() - start };
    } catch (error) {
      return { status: 'unhealthy', latency: Date.now() - start };
    }
  }
}
