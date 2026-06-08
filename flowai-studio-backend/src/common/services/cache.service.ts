/**
 * 多级缓存服务 — L1 内存 + L2 Redis
 *
 * Phase 2.4 设计:
 * - L1: 进程内 LRU 缓存，亚毫秒延迟，适合高频热点数据
 * - L2: Redis 分布式缓存，毫秒级延迟，适合跨实例共享数据
 * - 缓存穿透保护: 空值缓存 + 布隆过滤器思路（short TTL for null）
 * - 缓存雪崩保护: TTL 随机抖动（jitter）
 * - 缓存击穿保护: 互斥锁（lock）防止并发回源
 *
 * 竞品对标:
 * - Dify: Redis 单层缓存 + @cacheable 装饰器
 * - Coze: 多层缓存 + 本地缓存预热
 * - FastGPT: Redis 缓存 + 内存缓存（独立实现，无统一抽象）
 * - n8n: Redis 缓存 + 内存缓存（无 L1/L2 联动）
 * - Spring Cache: @Cacheable + CacheManager 多级缓存
 * - 本设计: L1 LRU + L2 Redis 联动 + 互斥锁 + TTL 抖动 + 缓存统计
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from './redis.service';

// ============================================================
// L1 内存缓存 — LRU 实现
// ============================================================

// 空值标记 — 用于区分"缓存了 null/undefined"和"缓存未命中"
const NULL_VALUE_MARKER = Symbol('__CACHE_NULL__');

interface CacheEntry<T> {
  value: T | typeof NULL_VALUE_MARKER;
  expiresAt: number; // ms timestamp
  createdAt: number;
}

/**
 * L1 进程内 LRU 缓存
 *
 * 特性:
 * - O(1) get/set 操作
 * - LRU 淘汰策略
 * - TTL 过期自动清理
 * - maxEntries 上限防内存溢出
 * - 周期性清理过期条目
 */
class LRUMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly logger = new Logger(LRUMemoryCache.name);

  constructor(
    private readonly maxEntries: number = 1000,
    private readonly cleanupIntervalMs: number = 60_000, // 1 分钟清理一次
  ) {
    this.startCleanup();
  }

  /**
   * 获取缓存值
   * @returns { value: T } 如果命中（包括 null 值），null 如果未命中
   */
  get<T>(key: string): { value: T } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 过期检查
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // LRU: 重新插入到末尾（Map 保持插入顺序）
    this.cache.delete(key);
    this.cache.set(key, entry);

    // 处理 null 值标记
    if (entry.value === NULL_VALUE_MARKER) {
      return { value: null as T };
    }

    return { value: entry.value as T };
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    // LRU 淘汰: 超过 maxEntries 时删除最老的
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    // 用标记替换 null/undefined，以便区分"缓存了 null"和"未命中"
    const storedValue = (value === null || value === undefined)
      ? NULL_VALUE_MARKER
      : value;

    this.cache.set(key, {
      value: storedValue,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 按前缀批量删除
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; maxEntries: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      keys: [...this.cache.keys()],
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let expired = 0;
      for (const [key, entry] of this.cache) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
          expired++;
        }
      }
      if (expired > 0) {
        this.logger.debug(`L1 cleanup: removed ${expired} expired entries, ${this.cache.size} remaining`);
      }
    }, this.cleanupIntervalMs);
  }
}

// ============================================================
// 缓存统计
// ============================================================

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  l1Evictions: number;
  lockAcquires: number;
  lockContends: number;
  totalLoads: number;
}

// ============================================================
// 缓存配置
// ============================================================

export interface MultiLevelCacheConfig {
  /** L1 最大条目数，默认 1000 */
  l1MaxEntries?: number;
  /** L1 默认 TTL（秒），默认 60 */
  l1DefaultTTL?: number;
  /** L2 默认 TTL（秒），默认 300 */
  l2DefaultTTL?: number;
  /** TTL 抖动比例 (0-0.5)，防止缓存雪崩，默认 0.1 (10%) */
  ttlJitter?: number;
  /** 空值缓存 TTL（秒），防止缓存穿透，默认 30 */
  nullValueTTL?: number;
  /** 互斥锁超时（秒），防止缓存击穿，默认 10 */
  lockTimeout?: number;
  /** 是否启用 L1 缓存，默认 true */
  l1Enabled?: boolean;
  /** 是否启用 L2 缓存，默认 true */
  l2Enabled?: boolean;
  /** 缓存键前缀，默认 'cache' */
  keyPrefix?: string;
}

// ============================================================
// 多级缓存服务
// ============================================================

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly l1: LRUMemoryCache;
  private readonly config: Required<MultiLevelCacheConfig>;

  // 互斥锁: 防止缓存击穿（并发回源）
  private readonly locks = new Map<string, Promise<any>>();

  // 缓存统计
  private readonly stats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    l1Evictions: 0,
    lockAcquires: 0,
    lockContends: 0,
    totalLoads: 0,
  };

  constructor(
    private readonly redisService: RedisService,
    config?: MultiLevelCacheConfig,
  ) {
    this.config = {
      l1MaxEntries: config?.l1MaxEntries ?? 1000,
      l1DefaultTTL: config?.l1DefaultTTL ?? 60,
      l2DefaultTTL: config?.l2DefaultTTL ?? 300,
      ttlJitter: config?.ttlJitter ?? 0.1,
      nullValueTTL: config?.nullValueTTL ?? 30,
      lockTimeout: config?.lockTimeout ?? 10,
      l1Enabled: config?.l1Enabled ?? true,
      l2Enabled: config?.l2Enabled ?? true,
      keyPrefix: config?.keyPrefix ?? 'cache',
    };

    this.l1 = new LRUMemoryCache(this.config.l1MaxEntries);
    this.logger.log(
      `Multi-level cache initialized: L1=${this.config.l1Enabled ? `${this.config.l1MaxEntries} entries, ${this.config.l1DefaultTTL}s TTL` : 'disabled'}, ` +
      `L2=${this.config.l2Enabled ? `${this.config.l2DefaultTTL}s TTL` : 'disabled'}, ` +
      `jitter=${(this.config.ttlJitter * 100).toFixed(0)}%`,
    );
  }

  onModuleDestroy() {
    this.l1.destroy();
  }

  // ============================================================
  // 核心操作
  // ============================================================

  /**
   * 多级缓存读取 — L1 → L2 → factory 回源
   *
   * 流程:
   * 1. 查 L1 缓存 → 命中则直接返回
   * 2. 查 L2 缓存 → 命中则回写 L1 并返回
   * 3. 互斥锁防击穿 → 只允许一个请求回源
   * 4. 回源获取数据 → 写入 L2 + L1
   * 5. 空值缓存防穿透
   *
   * @param key 缓存键（不含前缀）
   * @param factory 回源函数（缓存未命中时调用）
   * @param ttlSeconds TTL（秒），默认使用配置中的 l2DefaultTTL
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const fullKey = this.buildKey(key);
    const l2TTL = ttlSeconds ?? this.config.l2DefaultTTL;
    const l1TTL = Math.min(l2TTL * 0.2, this.config.l1DefaultTTL); // L1 TTL 短于 L2

    // 1. 查 L1
    if (this.config.l1Enabled) {
      const l1Result = this.l1.get<T>(fullKey);
      if (l1Result !== null) {
        this.stats.l1Hits++;
        return l1Result.value;
      }
      this.stats.l1Misses++;
    }

    // 2. 查 L2
    if (this.config.l2Enabled) {
      try {
        const l2Value = await this.redisService.getCached<T>(fullKey);
        if (l2Value !== null) {
          this.stats.l2Hits++;
          // 回写 L1
          if (this.config.l1Enabled) {
            const l1TTLWithJitter = this.applyJitter(l1TTL * 1000);
            this.l1.set(fullKey, l2Value, l1TTLWithJitter);
          }
          return l2Value;
        }
        this.stats.l2Misses++;
      } catch (error) {
        // Redis 读取失败，降级继续
        this.logger.warn(`L2 read failed for key "${fullKey}": ${error instanceof Error ? error.message : error}`);
        this.stats.l2Misses++;
      }
    }

    // 3. 互斥锁防击穿
    const lockKey = `lock:${fullKey}`;
    const existingLock = this.locks.get(lockKey);
    if (existingLock) {
      this.stats.lockContends++;
      // 等待锁释放后重新查缓存
      try {
        await existingLock;
      } catch {
        // 锁持有者回源失败，我们自己也尝试回源
      }

      // 锁释放后，重新检查缓存（可能已被锁持有者写入）
      if (this.config.l1Enabled) {
        const l1Result = this.l1.get<T>(fullKey);
        if (l1Result !== null) return l1Result.value;
      }
      if (this.config.l2Enabled) {
        try {
          const l2Value = await this.redisService.getCached<T>(fullKey);
          if (l2Value !== null) {
            if (this.config.l1Enabled) {
              this.l1.set(fullKey, l2Value, this.applyJitter(l1TTL * 1000));
            }
            return l2Value;
          }
        } catch {
          // Redis 读取失败，继续回源
        }
      }
    }

    // 4. 获取锁并回源
    this.stats.lockAcquires++;
    this.stats.totalLoads++;

    const loadPromise = this.loadFromSource<T>(fullKey, factory, l2TTL, l1TTL);
    this.locks.set(lockKey, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.locks.delete(lockKey);
    }
  }

  /**
   * 直接获取缓存值（不回源）
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key);

    // L1
    if (this.config.l1Enabled) {
      const l1Result = this.l1.get<T>(fullKey);
      if (l1Result !== null) return l1Result.value;
    }

    // L2
    if (this.config.l2Enabled) {
      try {
        const l2Value = await this.redisService.getCached<T>(fullKey);
        if (l2Value !== null) {
          // 回写 L1
          if (this.config.l1Enabled) {
            const l1TTL = this.config.l1DefaultTTL * 1000;
            this.l1.set(fullKey, l2Value, this.applyJitter(l1TTL));
          }
          return l2Value;
        }
      } catch (error) {
        // Redis 读取失败，降级返回 null
        this.logger.warn(`L2 read failed in get() for key "${fullKey}": ${error instanceof Error ? error.message : error}`);
      }
    }

    return null;
  }

  /**
   * 手动设置缓存值（同时写 L1 + L2）
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const fullKey = this.buildKey(key);
    const l2TTL = ttlSeconds ?? this.config.l2DefaultTTL;
    const l1TTL = Math.min(l2TTL * 0.2, this.config.l1DefaultTTL);

    // L1
    if (this.config.l1Enabled) {
      this.l1.set(fullKey, value, this.applyJitter(l1TTL * 1000));
    }

    // L2
    if (this.config.l2Enabled) {
      const l2TTLWithJitter = this.applyJitterSeconds(l2TTL);
      await this.redisService.setCached(fullKey, value, l2TTLWithJitter);
    }
  }

  /**
   * 删除缓存（同时删除 L1 + L2）
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.buildKey(key);

    // L1
    if (this.config.l1Enabled) {
      this.l1.delete(fullKey);
    }

    // L2
    if (this.config.l2Enabled) {
      await this.redisService.del(fullKey);
    }
  }

  /**
   * 按前缀批量删除缓存（同时删除 L1 + L2）
   *
   * 用于缓存失效场景，如知识库更新后清除所有相关缓存
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    const fullPrefix = this.buildKey(prefix);
    let count = 0;

    // L1
    if (this.config.l1Enabled) {
      count += this.l1.deleteByPrefix(fullPrefix);
    }

    // L2: 使用 SCAN 而非 KEYS（生产安全）
    if (this.config.l2Enabled) {
      const client = this.redisService.getClient();
      let cursor = '0';
      let l2Count = 0;

      do {
        const result = await client.scan(cursor, 'MATCH', `${fullPrefix}*`, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          await client.del(...keys);
          l2Count += keys.length;
        }
      } while (cursor !== '0');

      count += l2Count;
    }

    this.logger.debug(`Cache evicted by prefix "${prefix}": ${count} keys removed`);
    return count;
  }

  /**
   * 清空所有缓存（L1 + L2 中本项目管理的键）
   */
  async clear(): Promise<void> {
    // L1
    if (this.config.l1Enabled) {
      this.l1.clear();
    }

    // L2: 只清除本项目的缓存键
    if (this.config.l2Enabled) {
      await this.deleteByPrefix('');
    }

    this.logger.log('All caches cleared');
  }

  // ============================================================
  // 缓存预热
  // ============================================================

  /**
   * 批量预热缓存
   *
   * 用于系统启动时加载热点数据，避免冷启动后大量回源
   *
   * @param entries 键值对数组
   * @param ttlSeconds TTL
   */
  async warmUp<T>(entries: Array<{ key: string; value: T }>, ttlSeconds?: number): Promise<void> {
    const startTime = Date.now();

    await Promise.allSettled(
      entries.map(({ key, value }) => this.set(key, value, ttlSeconds)),
    );

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `Cache warm-up: ${entries.length} entries loaded in ${elapsed}ms`,
    );
  }

  /**
   * 使用 factory 批量预热缓存
   *
   * @param keys 需要预热的键列表
   * @param factory 根据键获取值的函数
   * @param ttlSeconds TTL
   */
  async warmUpWithFactory<T>(
    keys: string[],
    factory: (key: string) => Promise<T>,
    ttlSeconds?: number,
  ): Promise<void> {
    const startTime = Date.now();
    let loaded = 0;
    let cached = 0;

    const results = await Promise.allSettled(
      keys.map(async (key) => {
        // 先检查是否已缓存
        const existing = await this.get<T>(key);
        if (existing !== null) {
          cached++;
          return;
        }
        // 未缓存，回源
        const value = await factory(key);
        await this.set(key, value, ttlSeconds);
        loaded++;
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    const elapsed = Date.now() - startTime;
    this.logger.log(
      `Cache warm-up: ${keys.length} keys checked, ${cached} already cached, ` +
      `${loaded} loaded, ${failed} failed, ${elapsed}ms`,
    );
  }

  // ============================================================
  // 缓存统计
  // ============================================================

  getStats(): CacheStats & {
    l1Size: number;
    l1MaxEntries: number;
    l1HitRate: string;
    l2HitRate: string;
    overallHitRate: string;
  } {
    const l1Total = this.stats.l1Hits + this.stats.l1Misses;
    const l2Total = this.stats.l2Hits + this.stats.l2Misses;
    const totalHits = this.stats.l1Hits + this.stats.l2Hits;
    const totalRequests = l1Total;

    return {
      ...this.stats,
      l1Size: this.config.l1Enabled ? this.l1.size : 0,
      l1MaxEntries: this.config.l1MaxEntries,
      l1HitRate: l1Total > 0 ? `${((this.stats.l1Hits / l1Total) * 100).toFixed(1)}%` : 'N/A',
      l2HitRate: l2Total > 0 ? `${((this.stats.l2Hits / l2Total) * 100).toFixed(1)}%` : 'N/A',
      overallHitRate: totalRequests > 0 ? `${((totalHits / totalRequests) * 100).toFixed(1)}%` : 'N/A',
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats.l1Hits = 0;
    this.stats.l1Misses = 0;
    this.stats.l2Hits = 0;
    this.stats.l2Misses = 0;
    this.stats.l1Evictions = 0;
    this.stats.lockAcquires = 0;
    this.stats.lockContends = 0;
    this.stats.totalLoads = 0;
  }

  // ============================================================
  // 健康检查
  // ============================================================

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    l1: { enabled: boolean; size: number; maxEntries: number };
    l2: { enabled: boolean; status: string; latency: number };
    stats: { overallHitRate: string; totalLoads: number };
  }> {
    const l2Health = this.config.l2Enabled
      ? await this.redisService.healthCheck()
      : { status: 'disabled', latency: 0 };

    const stats = this.getStats();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!this.config.l1Enabled && !this.config.l2Enabled) {
      status = 'unhealthy';
    } else if (
      (this.config.l2Enabled && l2Health.status !== 'healthy') ||
      !this.config.l1Enabled
    ) {
      status = 'degraded';
    }

    return {
      status,
      l1: {
        enabled: this.config.l1Enabled,
        size: this.config.l1Enabled ? this.l1.size : 0,
        maxEntries: this.config.l1MaxEntries,
      },
      l2: {
        enabled: this.config.l2Enabled,
        status: l2Health.status,
        latency: l2Health.latency,
      },
      stats: {
        overallHitRate: stats.overallHitRate,
        totalLoads: stats.totalLoads,
      },
    };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private async loadFromSource<T>(
    fullKey: string,
    factory: () => Promise<T>,
    l2TTL: number,
    l1TTL: number,
  ): Promise<T> {
    let value: T;
    try {
      value = await factory();
    } catch (error) {
      // 回源失败不写缓存，下次请求重试
      this.logger.warn(
        `Cache load failed for key "${fullKey}": ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }

    // 空值缓存防穿透（使用较短 TTL）
    const effectiveL2TTL = value === null || value === undefined
      ? this.config.nullValueTTL
      : l2TTL;

    // 写 L2（失败不影响整体流程）
    if (this.config.l2Enabled) {
      try {
        const l2TTLWithJitter = this.applyJitterSeconds(effectiveL2TTL);
        await this.redisService.setCached(fullKey, value, l2TTLWithJitter);
      } catch (error) {
        this.logger.warn(
          `L2 write failed for key "${fullKey}": ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // 写 L1（空值也缓存）
    if (this.config.l1Enabled) {
      const l1TTLForValue = value === null || value === undefined
        ? Math.min(this.config.nullValueTTL * 1000, l1TTL * 1000)
        : this.applyJitter(l1TTL * 1000);
      this.l1.set(fullKey, value, l1TTLForValue);
    }

    return value;
  }

  /**
   * 构建完整缓存键
   * 格式: {keyPrefix}:{key}
   */
  private buildKey(key: string): string {
    return `${this.config.keyPrefix}:${key}`;
  }

  /**
   * TTL 抖动 — 防止大量缓存同时过期（缓存雪崩）
   *
   * @param ttlMs 原始 TTL（毫秒）
   * @returns 抖动后的 TTL（毫秒）
   */
  private applyJitter(ttlMs: number): number {
    const jitterRange = ttlMs * this.config.ttlJitter;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange; // ±jitter%
    return Math.max(ttlMs + jitter, 1000); // 至少 1 秒
  }

  /**
   * TTL 抖动（秒为单位）
   */
  private applyJitterSeconds(ttlSeconds: number): number {
    return Math.round(this.applyJitter(ttlSeconds * 1000) / 1000);
  }
}
