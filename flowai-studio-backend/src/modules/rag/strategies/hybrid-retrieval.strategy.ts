/**
 * 混合检索策略
 *
 * 结合向量检索和关键词检索，使用 RRF (Reciprocal Rank Fusion) 融合算法。
 * 兼顾语义匹配和精确匹配，是生产环境的推荐检索模式。
 *
 * 设计理念:
 * - 向量检索擅长语义匹配（如同义词、语义关联）
 * - 关键词检索擅长精确匹配（如产品编号、专有名词、错误代码）
 * - RRF 融合将两路检索结果按排名融合，无需调参即可获得稳定效果
 *
 * 竞品对标:
 * - Dify: hybrid 模式使用 RRF 融合，支持调整 vector/keyword 权重
 * - FastGPT: hybrid 使用自定义权重融合
 * - Coze: 仅向量检索
 * - Flowise: EnsembleRetriever 使用 RRF
 * - LangChain: EnsembleRetriever + RRF
 *
 * 本设计优势:
 * - 标准 RRF 算法（学术验证，无需调参）
 * - 支持加权 RRF（可通过 vectorWeight 调整向量检索权重）
 * - 保留各路分数和排名（便于调试和解释）
 * - 自适应降级：单路失败时仍可使用另一路结果
 *
 * 算法流程:
 * 1. 并行执行向量检索和关键词检索
 * 2. 为每个结果计算 RRF 分数: score(d) = w_v/(k+rank_v) + w_k/(k+rank_k)
 * 3. 按 RRF 分数降序排列
 * 4. 归一化分数到 0-1 范围
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  RetrievalStrategy,
  RetrievalRequest,
  RetrievalResult,
} from '../interfaces/retrieval-strategy.interface';
import { VectorStore } from '../interfaces/vector-store.interface';
import { EmbeddingProvider } from '../interfaces/embedding-provider.interface';
import { BM25KeywordService } from '../services/bm25-keyword.service';
import { RRFFusionService } from '../services/rrf-fusion.service';

@Injectable()
export class HybridRetrievalStrategy implements RetrievalStrategy {
  private readonly logger = new Logger(HybridRetrievalStrategy.name);

  readonly strategyName = 'hybrid';

  constructor(
    private bm25Service: BM25KeywordService,
    private rrfFusionService: RRFFusionService,
  ) {}

  /**
   * 执行混合检索
   *
   * 注意：向量检索部分需要外部注入 VectorStore 和 EmbeddingProvider，
   * 这里只负责关键词检索和 RRF 融合逻辑。
   * 实际调用由 RAGService.retrieveWithStrategy() 完成。
   */
  async retrieve(request: RetrievalRequest): Promise<RetrievalResult[]> {
    // 该方法不应被直接调用，因为需要 VectorStore 和 EmbeddingProvider
    throw new Error(
      'HybridRetrievalStrategy.retrieve() should be called via RAGService which injects ' +
      'VectorStore and EmbeddingProvider. Use RAGService.retrieveWithStrategy() instead.'
    );
  }

  /**
   * 执行关键词检索部分
   * 供 RAGService 调用
   */
  async keywordSearch(
    query: string,
    knowledgeBaseId: string,
    topK: number,
    filter?: Record<string, any>,
  ): Promise<RetrievalResult[]> {
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

  /**
   * 执行 RRF 融合
   * 供 RAGService 调用
   */
  fuseResults(
    vectorResults: RetrievalResult[],
    keywordResults: RetrievalResult[],
    params: {
      vectorWeight?: number;
      rrfK?: number;
      topK?: number;
      similarityThreshold?: number;
    } = {},
  ): RetrievalResult[] {
    const {
      vectorWeight = 0.7,
      rrfK = 60,
      topK = 5,
      similarityThreshold = 0,
    } = params;

    const keywordWeight = 1 - vectorWeight;

    return this.rrfFusionService.fuse(
      [
        { name: 'vector', results: vectorResults, weight: vectorWeight },
        { name: 'keyword', results: keywordResults, weight: keywordWeight },
      ],
      {
        k: rrfK,
        topK,
        similarityThreshold,
      },
    );
  }
}
