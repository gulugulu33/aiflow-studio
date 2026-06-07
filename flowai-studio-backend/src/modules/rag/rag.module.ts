/**
 * RAG Module — 检索增强生成模块
 *
 * Phase 2.2 重构:
 * - 新增 BM25KeywordService: 基于 PostgreSQL 全文搜索的关键词检索
 * - 新增 RRFFusionService: RRF 融合算法服务
 * - 新增检索策略: VectorRetrievalStrategy / KeywordRetrievalStrategy / HybridRetrievalStrategy
 * - RAGService 集成三种检索模式，根据 retrievalMode 自动选择
 * - 自适应降级：单路检索失败时使用另一路结果
 */
import { Module } from '@nestjs/common';
import { RAGController } from './rag.controller';
import { RAGService } from './services/rag.service';
import { EmbeddingFactory } from './factories/embedding.factory';
import { VectorStoreFactory } from './factories/vector-store.factory';
import { BM25KeywordService } from './services/bm25-keyword.service';
import { RRFFusionService } from './services/rrf-fusion.service';
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
  ],
  exports: [RAGService, EmbeddingFactory, VectorStoreFactory, BM25KeywordService, RRFFusionService],
})
export class RAGModule {}
