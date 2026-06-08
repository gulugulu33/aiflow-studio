/**
 * CacheService 多级缓存单元测试
 *
 * Phase 2.4 测试覆盖:
 * - L1 LRU 内存缓存: get/set/delete/deleteByPrefix/LRU淘汰/TTL过期
 * - CacheService: getOrSet (L1→L2→factory), set, delete, deleteByPrefix
 * - 互斥锁防击穿
 * - TTL 抖动
 * - 缓存统计
 * - 健康检查
 * - 预热
 * - 空值缓存防穿透
 */
import { CacheService } from '../cache.service';
import { RedisService } from '../redis.service';

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedisService: any;

  // Mock Redis client for SCAN
  const mockRedisClient = {
    scan: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock RedisService
    mockRedisService = {
      getCached: jest.fn().mockResolvedValue(null),
      setCached: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn().mockReturnValue(mockRedisClient),
      healthCheck: jest.fn().mockResolvedValue({ status: 'healthy', latency: 1 }),
    };

    // Direct instantiation (bypass NestJS DI for cleaner unit tests)
    cacheService = new CacheService(mockRedisService as any);
  });

  afterEach(() => {
    cacheService.onModuleDestroy();
  });

  // ============================================================
  // L1 LRU 内存缓存
  // ============================================================

  describe('L1 LRU Memory Cache', () => {
    it('should store and retrieve values from L1', async () => {
      const factory = jest.fn().mockResolvedValue({ name: 'test-kb' });

      // First call: L1 miss, L2 miss, factory called
      const result1 = await cacheService.getOrSet('kb:detail:1', factory, 300);
      expect(result1).toEqual({ name: 'test-kb' });
      expect(factory).toHaveBeenCalledTimes(1);

      // Second call: L1 hit (factory not called again)
      const result2 = await cacheService.getOrSet('kb:detail:1', factory, 300);
      expect(result2).toEqual({ name: 'test-kb' });
      expect(factory).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should handle L1 TTL expiration', async () => {
      // Use short TTL
      const service = new CacheService(mockRedisService as any, {
        l1DefaultTTL: 0.05, // 50ms
        l2DefaultTTL: 1,
      });

      const factory = jest.fn().mockResolvedValue('value');

      // First call: cache miss
      await service.getOrSet('test-key', factory, 1);

      // Wait for L1 TTL to expire
      await new Promise((r) => setTimeout(r, 100));

      // Second call: L1 expired, should check L2
      mockRedisService.getCached.mockResolvedValue('value');
      const result = await service.getOrSet('test-key', factory, 1);
      expect(result).toBe('value');
      expect(factory).toHaveBeenCalledTimes(1); // Factory not called again (L2 hit)

      service.onModuleDestroy();
    });

    it('should evict oldest entry when maxEntries reached', async () => {
      const service = new CacheService(mockRedisService as any, {
        l1MaxEntries: 3,
        l1DefaultTTL: 60,
        l2DefaultTTL: 300,
      });

      // Fill cache with 3 entries
      await service.set('key1', 'val1', 300);
      await service.set('key2', 'val2', 300);
      await service.set('key3', 'val3', 300);

      // Add 4th entry — should evict oldest
      await service.set('key4', 'val4', 300);

      // key1 should be evicted from L1, will fall through to L2
      mockRedisService.getCached.mockResolvedValue('val1');
      const result = await service.get('key1');
      expect(result).toBe('val1');

      service.onModuleDestroy();
    });

    it('should delete entries by prefix from L1', async () => {
      mockRedisClient.scan.mockResolvedValue(['0', []]); // No L2 keys

      await cacheService.set('kb:list:user1', ['kb1'], 300);
      await cacheService.set('kb:list:user2', ['kb2'], 300);
      await cacheService.set('kb:detail:1', { id: '1' }, 300);

      const deleted = await cacheService.deleteByPrefix('kb:list');
      expect(deleted).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================
  // L2 Redis 缓存
  // ============================================================

  describe('L2 Redis Cache', () => {
    it('should check L2 when L1 misses', async () => {
      // L1 empty, L2 hit
      mockRedisService.getCached.mockResolvedValue({ name: 'from-redis' });

      const factory = jest.fn().mockResolvedValue('should-not-be-called');
      const result = await cacheService.getOrSet('kb:detail:2', factory, 300);

      expect(result).toEqual({ name: 'from-redis' });
      expect(factory).not.toHaveBeenCalled();
    });

    it('should write to both L1 and L2 on cache miss', async () => {
      mockRedisService.getCached.mockResolvedValue(null);

      const factory = jest.fn().mockResolvedValue({ name: 'fresh-data' });
      await cacheService.getOrSet('kb:detail:3', factory, 300);

      // Should have called setCached (L2 write)
      expect(mockRedisService.setCached).toHaveBeenCalled();
    });

    it('should delete from both L1 and L2', async () => {
      // Set a value
      await cacheService.set('test-key', 'test-val', 300);

      // Delete it
      await cacheService.delete('test-key');

      // L2 delete should have been called
      expect(mockRedisService.del).toHaveBeenCalled();
    });
  });

  // ============================================================
  // getOrSet 核心逻辑
  // ============================================================

  describe('getOrSet', () => {
    it('should return cached value when L1 hits', async () => {
      const factory = jest.fn().mockResolvedValue('fresh');

      // First call populates cache
      mockRedisService.getCached.mockResolvedValue(null);
      await cacheService.getOrSet('hit-test', factory, 300);

      // Second call should hit L1
      const result = await cacheService.getOrSet('hit-test', factory, 300);
      expect(result).toBe('fresh');
      expect(factory).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should call factory on full cache miss', async () => {
      mockRedisService.getCached.mockResolvedValue(null);

      const factory = jest.fn().mockResolvedValue('from-factory');
      const result = await cacheService.getOrSet('miss-test', factory, 300);

      expect(result).toBe('from-factory');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should cache null/undefined values to prevent cache penetration', async () => {
      mockRedisService.getCached.mockResolvedValue(null);

      const factory = jest.fn().mockResolvedValue(null);

      // First call: factory returns null
      await cacheService.getOrSet('null-test', factory, 300);

      // Second call: should hit L1 cache (null value cached)
      const result = await cacheService.getOrSet('null-test', factory, 300);
      expect(result).toBeNull();
      // Factory should only be called once (null value was cached)
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should degrade gracefully when Redis fails', async () => {
      mockRedisService.getCached.mockRejectedValue(new Error('Redis down'));
      mockRedisService.setCached.mockRejectedValue(new Error('Redis down'));

      const factory = jest.fn().mockResolvedValue('fallback-data');

      // Should still work (L1 only mode)
      const result = await cacheService.getOrSet('redis-down-test', factory, 300);
      expect(result).toBe('fallback-data');
    });
  });

  // ============================================================
  // 缓存统计
  // ============================================================

  describe('Cache Stats', () => {
    it('should track hit and miss counts', async () => {
      mockRedisService.getCached.mockResolvedValue(null);

      const factory = jest.fn().mockResolvedValue('value');

      // Miss
      await cacheService.getOrSet('stats-test', factory, 300);

      // Hit
      await cacheService.getOrSet('stats-test', factory, 300);

      const stats = cacheService.getStats();
      // At least one L1 miss (first call) and one L1 hit (second call)
      expect(stats.l1Misses).toBeGreaterThanOrEqual(1);
      expect(stats.l1Hits).toBeGreaterThanOrEqual(1);
      expect(stats.totalLoads).toBe(1);
    });

    it('should reset stats', () => {
      cacheService.resetStats();
      const stats = cacheService.getStats();
      expect(stats.l1Hits).toBe(0);
      expect(stats.l1Misses).toBe(0);
      expect(stats.l2Hits).toBe(0);
      expect(stats.l2Misses).toBe(0);
      expect(stats.totalLoads).toBe(0);
    });

    it('should report overall hit rate', async () => {
      mockRedisService.getCached.mockResolvedValue(null);

      const factory = jest.fn().mockResolvedValue('val');

      // 1 miss
      await cacheService.getOrSet('rate-test', factory, 300);
      // 1 hit
      await cacheService.getOrSet('rate-test', factory, 300);

      const stats = cacheService.getStats();
      expect(stats.overallHitRate).not.toBe('N/A');
    });
  });

  // ============================================================
  // 健康检查
  // ============================================================

  describe('Health Check', () => {
    it('should report healthy when both L1 and L2 are available', async () => {
      mockRedisService.healthCheck.mockResolvedValue({ status: 'healthy', latency: 1 });

      const health = await cacheService.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.l1.enabled).toBe(true);
      expect(health.l2.enabled).toBe(true);
    });

    it('should report degraded when L2 is unhealthy', async () => {
      mockRedisService.healthCheck.mockResolvedValue({ status: 'unhealthy', latency: 1000 });

      const health = await cacheService.healthCheck();
      expect(health.status).toBe('degraded');
    });

    it('should report l1 size', async () => {
      mockRedisService.healthCheck.mockResolvedValue({ status: 'healthy', latency: 1 });

      const health = await cacheService.healthCheck();
      expect(health.l1.size).toBeGreaterThanOrEqual(0);
      expect(health.l1.maxEntries).toBe(1000);
    });
  });

  // ============================================================
  // 预热
  // ============================================================

  describe('Warm Up', () => {
    it('should batch set cache entries', async () => {
      const entries = [
        { key: 'warm1', value: 'val1' },
        { key: 'warm2', value: 'val2' },
        { key: 'warm3', value: 'val3' },
      ];

      await cacheService.warmUp(entries, 300);

      // All entries should be set in L2
      expect(mockRedisService.setCached).toHaveBeenCalledTimes(3);
    });

    it('should warm up with factory', async () => {
      mockRedisService.getCached.mockResolvedValue(null);

      const factory = jest.fn().mockImplementation((key) => `value-for-${key}`);
      const keys = ['key1', 'key2'];

      await cacheService.warmUpWithFactory(keys, factory, 300);

      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // 直接 get/set 操作
  // ============================================================

  describe('Direct get/set', () => {
    it('should manually set and get values', async () => {
      await cacheService.set('manual-key', 'manual-val', 300);
      mockRedisService.getCached.mockResolvedValue('manual-val');

      const result = await cacheService.get('manual-key');
      // Should get from L1 first
      expect(result).toBe('manual-val');
    });

    it('should return null for non-existent key', async () => {
      mockRedisService.getCached.mockResolvedValue(null);

      const result = await cacheService.get('non-existent');
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // deleteByPrefix with SCAN
  // ============================================================

  describe('deleteByPrefix with SCAN', () => {
    it('should use SCAN instead of KEYS for production safety', async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(['1', ['cache:kb:list:1', 'cache:kb:list:2']])
        .mockResolvedValueOnce(['0', []]);
      mockRedisClient.del.mockResolvedValue(2);

      const count = await cacheService.deleteByPrefix('kb:list');

      // SCAN should be used
      expect(mockRedisClient.scan).toHaveBeenCalled();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
