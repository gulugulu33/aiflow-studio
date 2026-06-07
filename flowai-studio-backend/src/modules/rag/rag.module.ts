/**
 * RAG Module — 检索增强生成模块
 *
 * Phase 2.1 重构:
 * - 引入 EmbeddingFactory 和 VectorStoreFactory
 * - 支持多种 Embedding Provider (Qwen/OpenAI/Ollama)
 * - 支持多种 VectorStore (pgvector/Qdrant/Milvus)
 * - 工厂模式动态创建，解耦具体实现
 */
import { Module } from '@nestjs/common';
import { RAGController } from './rag.controller';
import { RAGService } from './services/rag.service';
import { EmbeddingFactory } from './factories/embedding.factory';
import { VectorStoreFactory } from './factories/vector-store.factory';
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
  providers: [RAGService, EmbeddingFactory, VectorStoreFactory],
  exports: [RAGService, EmbeddingFactory, VectorStoreFactory],
})
export class RAGModule {}
