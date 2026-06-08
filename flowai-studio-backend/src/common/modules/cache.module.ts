/**
 * 缓存模块 — L1 内存 + L2 Redis 多级缓存
 *
 * Phase 2.4 设计:
 * - 全局模块，所有服务均可注入 CacheService
 * - L1: 进程内 LRU 缓存（亚毫秒）
 * - L2: Redis 分布式缓存（毫秒级）
 * - 互斥锁防击穿 + TTL 抖动防雪崩 + 空值缓存防穿透
 *
 * 竞品对标:
 * - Dify: Redis 单层缓存
 * - Coze: 多层缓存 + 预热
 * - Spring Cache: CacheManager 多级
 * - 本设计: L1 LRU + L2 Redis + 互斥锁 + 统计 + 预热
 */
import { Global, Module } from '@nestjs/common';
import { CacheService } from '../services/cache.service';
import { RedisModule } from './redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
