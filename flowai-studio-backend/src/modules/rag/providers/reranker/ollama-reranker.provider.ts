/**
 * Ollama Reranker Provider
 *
 * 使用 Ollama 本地部署的重排序模型（如 bge-reranker-v2-m3）。
 * 零 API 成本，数据不离开服务器，适合数据隐私要求高的场景。
 *
 * 支持的模型:
 * - bge-reranker-v2-m3: 多语言重排序（推荐）
 * - bge-reranker-v2-gemma: 更大模型，更高精度
 * - jina-reranker-v2-base-multilingual: Jina AI 多语言重排序
 *
 * 特性:
 * - 本地部署，零 API 成本
 * - 数据隐私：不离开服务器
 * - 自动批处理
 * - 健康检查验证模型可用性
 *
 * 竞品对标:
 * - Dify: 不支持本地 Reranker
 * - FastGPT: 不支持本地 Reranker
 * - Flowise: 支持 HuggingFace 本地 Reranker
 * - 本设计: Ollama 本地 Reranker（零部署成本，与 Ollama Embedding 共用服务）
 *
 * Ollama API 参考: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  RerankerProvider,
  RerankRequest,
  RerankBatchResult,
  RerankerProviderConfig,
} from '../../interfaces/reranker-provider.interface';

@Injectable()
export class OllamaReranker implements RerankerProvider {
  private readonly logger = new Logger(OllamaReranker.name);

  private readonly config: Required<Pick<RerankerProviderConfig, 'model' | 'timeout'>> & {
    baseUrl: string;
    maxConcurrency: number;
  };

  constructor(config: RerankerProviderConfig) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:11434',
      model: config.model || 'bge-reranker-v2-m3',
      maxConcurrency: config.maxConcurrency || 3,
      timeout: config.timeout || 60000,
    };
  }

  async rerank(request: RerankRequest): Promise<RerankBatchResult> {
    const { query, documents, topN } = request;

    if (!documents || documents.length === 0) {
      return { results: [], model: this.config.model };
    }

    const effectiveTopN = topN || documents.length;

    // Ollama reranker 使用 /api/embeddings 或 /api/generate 接口
    // bge-reranker 模型通过特定 prompt 格式进行 rerank
    // 这里使用交叉编码方式：对每个文档计算 query-doc 相关性分数
    try {
      const scores = await this.computeRerankScores(query, documents);

      // 按 rerank 分数降序排列
      const indexed = documents.map((doc, index) => ({
        doc,
        score: scores[index] || 0,
        index,
      }));

      indexed.sort((a, b) => b.score - a.score);

      // 归一化分数到 0-1
      const maxScore = Math.max(...indexed.map((i) => i.score));
      const minScore = Math.min(...indexed.map((i) => i.score));
      const scoreRange = maxScore - minScore;

      const results = indexed.slice(0, effectiveTopN).map((item) => ({
        id: item.doc.id,
        content: item.doc.content,
        relevanceScore: scoreRange > 0
          ? (item.score - minScore) / scoreRange
          : (item.score > 0 ? 1.0 : 0.0),
        originalScore: item.doc.originalScore,
        metadata: item.doc.metadata,
      }));

      return {
        results,
        model: this.config.model,
      };
    } catch (error) {
      this.logger.error(
        `Ollama rerank failed: ${error instanceof Error ? error.message : error}`,
      );
      // 降级：返回原始排序
      return {
        results: documents.slice(0, effectiveTopN).map((doc, index) => ({
          id: doc.id,
          content: doc.content,
          relevanceScore: doc.originalScore || 1 - index / documents.length,
          originalScore: doc.originalScore,
          metadata: doc.metadata,
        })),
        model: this.config.model,
      };
    }
  }

  getModel(): string {
    return this.config.model;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;

      const data = await response.json() as any;
      // 检查 reranker 模型是否已拉取
      const models = data.models || [];
      return models.some((m: any) => m.name === this.config.model || m.name.startsWith(this.config.model));
    } catch {
      return false;
    }
  }

  /**
   * 计算 query-document rerank 分数
   *
   * 使用 Ollama 的 /api/embeddings 接口获取交叉编码分数
   * bge-reranker 模型支持 query-doc 对的相似度计算
   */
  private async computeRerankScores(query: string, documents: RerankRequest['documents']): Promise<number[]> {
    // 方法1：使用 prompt 格式请求 bge-reranker
    // 格式: {"query": "...", "document": "..."} → 返回相关性分数
    const batchSize = this.config.maxConcurrency;
    const scores: number[] = new Array(documents.length).fill(0);

    // 并行处理，每批 maxConcurrency 个
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchPromises = batch.map((doc, batchIndex) =>
        this.computeSingleScore(query, doc.content).catch((error) => {
          this.logger.warn(
            `Failed to compute score for doc ${doc.id}: ${error instanceof Error ? error.message : error}`,
          );
          return doc.originalScore || 0;
        }),
      );

      const batchScores = await Promise.all(batchPromises);
      for (let j = 0; j < batchScores.length; j++) {
        scores[i + j] = batchScores[j];
      }
    }

    return scores;
  }

  /**
   * 计算单个 query-document 对的相关性分数
   */
  private async computeSingleScore(query: string, document: string): Promise<number> {
    // 使用 Ollama generate 接口 + reranker prompt
    // bge-reranker 模型接受特定格式的输入
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt: `Classify the relevance of the following document to the query.\n\nQuery: ${query}\n\nDocument: ${document}\n\nRelevance score (0-1):`,
        stream: false,
        options: {
          temperature: 0,
          num_predict: 10,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const responseText = (data.response || '').trim();

    // 尝试从响应中提取分数
    const scoreMatch = responseText.match(/(\d+\.?\d*)/);
    if (scoreMatch) {
      return Math.min(Math.max(parseFloat(scoreMatch[1]), 0), 1);
    }

    // 如果无法提取分数，使用回退方法
    return 0.5;
  }
}
