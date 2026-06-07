import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';

/**
 * 健康检查控制器
 * 用于 Docker HEALTHCHECK、K8s liveness/readiness probe、监控面板
 *
 * 竞品对标:
 * - Dify: /health 端点检查 DB + Redis + 向量库
 * - n8n: /healthz 端点
 * - FastGPT: /api/health 端点
 */
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, any> = {};
    let isHealthy = true;

    // 1. 数据库健康检查
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'healthy' };
    } catch (error) {
      checks.database = { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
      isHealthy = false;
    }

    // 2. Redis 健康检查
    try {
      const redisHealth = await this.redisService.healthCheck();
      checks.redis = redisHealth;
      if (redisHealth.status !== 'healthy') isHealthy = false;
    } catch (error) {
      checks.redis = { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
      isHealthy = false;
    }

    // 3. pgvector 扩展检查
    try {
      const result = await this.prisma.$queryRaw`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`;
      checks.pgvector = Array.isArray(result) && result.length > 0
        ? { status: 'healthy', version: result[0].extversion }
        : { status: 'warning', message: 'pgvector extension not installed' };
    } catch (error) {
      checks.pgvector = { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
