import { Global, Module } from '@nestjs/common';
import { RedisService } from '../services/redis.service';

/**
 * Redis 全局模块
 * 提供缓存、会话管理、限流、登录安全等能力
 *
 * 竞品对标:
 * - Dify: Redis 做缓存 + Rate Limiting + 任务队列状态
 * - Coze: Redis 做会话 + 分布式锁 + 实时协作
 * - FastGPT: Redis 做 API 缓存 + 限流
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
