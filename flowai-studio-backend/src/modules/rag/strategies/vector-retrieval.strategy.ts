/**
 * 向量检索策略
 *
 * 纯向量相似度检索，使用 EmbeddingProvider 生成查询向量 + VectorStore 搜索。
 * 适用于语义匹配场景（如同义词、语义关联、跨语言）。
 *
 * 竞品对标:
 * - Dify: 向量检索使用 cosine similarity + HNSW 索引
 * - FastGPT: 向量检索使用 MongoDB Atlas Vector Search
 * - 本设计: 支持多种 VectorStore（pgvector/Qdrant/Milvus），HNSW 索引加速
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  RetrievalStrategy,
  RetrievalRequest,
  RetrievalResult,
} from '../interfaces/retrieval-strategy.interface';
import { VectorStore } from '../interfaces/vector-store.interface';
import { EmbeddingProvider } from '../interfaces/embedding-provider.interface';
import { VectorSearchFilter } from '../interfaces/vector-store.interface';

@Injectable()
export class VectorRetrievalStrategy implements RetrievalStrategy {
  private readonly logger = new Logger(VectorRetrievalStrategy.name);

  readonly strategyName = 'vector';

  /**
   * 执行向量检索
   */
  async retrieve(request: RetrievalRequest): Promise<RetrievalResult[]> {
    const {
      query,
      queryVector,
      knowledgeBaseId,
      topK = 5,
      similarityThreshold = 0,
      filter,
    } = request;

    if (!queryVector || queryVector.length === 0) {
      this.logger.warn('Query vector is empty, returning empty results');
      return [];
    }

    // 构建 VectorStore 搜索参数
    const searchFilter: VectorSearchFilter | undefined = filter
      ? this.convertToVectorSearchFilter(filter)
      : {
          match: { key: 'knowledgeBaseId', value: knowledgeBaseId },
        };

    // 如果 filter 中没有 knowledgeBaseId 条件，添加它
    if (searchFilter && searchFilter.match && searchFilter.match.key !== 'knowledgeBaseId') {
      // 使用 AND 组合
      const combinedFilter: VectorSearchFilter = {
        and: [
          { match: { key: 'knowledgeBaseId', value: knowledgeBaseId } },
          searchFilter,
        ],
      };
      return this.performVectorSearch(queryVector, topK, similarityThreshold, combinedFilter);
    }

    return this.performVectorSearch(queryVector, topK, similarityThreshold, searchFilter);
  }

  /**
   * 执行向量搜索（内部方法）
   */
  private async performVectorSearch(
    queryVector: number[],
    topK: number,
    similarityThreshold: number,
    filter?: VectorSearchFilter,
  ): Promise<RetrievalResult[]> {
    // 注意：实际的 VectorStore 搜索由 RAGService 调用，此处仅定义策略逻辑
    // VectorStore 实例由 RAGService 注入和管理
    // 该方法在策略中不被直接调用，而是由 RAGService 根据 retrieve 方法的返回结果进行组合
    throw new Error(
      'VectorRetrievalStrategy.retrieve() should be called via RAGService which injects VectorStore. ' +
      'Use RAGService.retrieveWithStrategy() instead.'
    );
  }

  /**
   * 将简单 filter 转换为 VectorSearchFilter
   */
  private convertToVectorSearchFilter(filter: Record<string, any>): VectorSearchFilter {
    const keys = Object.keys(filter);
    if (keys.length === 1) {
      const key = keys[0];
      const value = filter[key];
      if (Array.isArray(value)) {
        return { in: { key, values: value } };
      }
      return { match: { key, value } };
    }

    // 多个键 → AND 组合
    return {
      and: keys.map((key) => {
        const value = filter[key];
        if (Array.isArray(value)) {
          return { in: { key, values: value } };
        }
        return { match: { key, value } };
      }),
    };
  }
}
