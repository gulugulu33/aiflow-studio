/**
 * RAG Module — 检索增强生成模块
 *
 * Phase 2.3 增强:
 * - 新增 RerankerFactory: 重排序工厂，支持 Cohere + Ollama
 * - RAGService 集成 Reranker：检索后自动重排序
 * - 降级策略：Reranker 不可用时跳过，返回原始检索结果
 *
 * Phase 2.2 重构:
 * - BM25KeywordService: 基于 PostgreSQL 全文搜索的关键词检索
 * - RRFFusionService: RRF 融合算法服务
 * - 检索策略: Vector / Keyword / Hybrid
 * - 自适应降级：单路检索失败时使用另一路结果
 */
import { Module } from '@nestjs/common';
import { RAGController } from './rag.controller';
import { RAGService } from './services/rag.service';
import { EmbeddingFactory } from './factories/embedding.factory';
import { VectorStoreFactory } from './factories/vector-store.factory';
import { BM25KeywordService } from './services/bm25-keyword.service';
import { RRFFusionService } from './services/rrf-fusion.service';
import { RerankerFactory } from './providers/reranker/reranker.factory';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  ],
  controllers: [RAGController],
  providers: [
    RAGService,
    EmbeddingFactory,
    VectorStoreFactory,
    BM25KeywordService,
    RRFFusionService,
    RerankerFactory,
  ],
  exports: [RAGService, EmbeddingFactory, VectorStoreFactory, BM25KeywordService, RRFFusionService, RerankerFactory],
})
export class RAGModule {}
