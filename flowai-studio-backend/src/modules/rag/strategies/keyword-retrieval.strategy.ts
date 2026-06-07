/**
 * 关键词检索策略
 *
 * 基于 BM25 的关键词检索，使用 PostgreSQL 全文搜索实现。
 * 适用于精确匹配场景（如产品编号、专有名词、错误代码）。
 *
 * 竞品对标:
 * - Dify: 全文搜索使用 Elasticsearch 或 PostgreSQL tsvector
 * - FastGPT: MongoDB Atlas Full-Text Search
 * - 本设计: PostgreSQL tsvector + GIN 索引，零额外部署
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  RetrievalStrategy,
  RetrievalRequest,
  RetrievalResult,
} from '../interfaces/retrieval-strategy.interface';
import { BM25KeywordService } from '../services/bm25-keyword.service';

@Injectable()
export class KeywordRetrievalStrategy implements RetrievalStrategy {
  private readonly logger = new Logger(KeywordRetrievalStrategy.name);

  readonly strategyName = 'keyword';

  constructor(private bm25Service: BM25KeywordService) {}

  /**
   * 执行关键词检索
   */
  async retrieve(request: RetrievalRequest): Promise<RetrievalResult[]> {
    const { query, knowledgeBaseId, topK = 5, filter } = request;

    if (!query || !query.trim()) {
      this.logger.warn('Empty query for keyword search, returning empty results');
      return [];
    }

    const results = await this.bm25Service.search({
      query,
      knowledgeBaseId,
      topK,
      filter,
    });

    return results.map((result) => ({
      id: result.id,
      content: result.content,
      score: result.score,
      source: 'keyword' as const,
      metadata: result.metadata,
    }));
  }
}
