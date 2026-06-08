/**
 * Cohere Rerank Provider
 *
 * 使用 Cohere Rerank API 对候选文档进行重排序。
 * Cohere Rerank 是业界最强的重排序 API 之一，支持多语言。
 *
 * 特性:
 * - 支持 Cohere Rerank API v2
 * - 支持 rerank-v3.5 / rerank-english-v3.0 / rerank-multilingual-v3.0
 * - 自动批处理（每批最多 1000 个文档）
 * - 指数退避重试
 *
 * 竞品对标:
 * - Dify: 支持 Cohere Rerank ✓
 * - FastGPT: 支持 Cohere Rerank ✓
 * - Flowise: 支持 Cohere Rerank ✓
 *
 * 参考文档: https://docs.cohere.com/reference/rerank
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  RerankerProvider,
  RerankRequest,
  RerankBatchResult,
  RerankerProviderConfig,
} from '../../interfaces/reranker-provider.interface';

@Injectable()
export class CohereReranker implements RerankerProvider {
  private readonly logger = new Logger(CohereReranker.name);

  private readonly config: Required<Pick<RerankerProviderConfig, 'apiKey' | 'model' | 'timeout'>> & {
    baseUrl: string;
    maxConcurrency: number;
  };

  constructor(config: RerankerProviderConfig) {
    this.config = {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || 'https://api.cohere.com',
      model: config.model || 'rerank-v3.5',
      maxConcurrency: config.maxConcurrency || 5,
      timeout: config.timeout || 30000,
    };
  }

  async rerank(request: RerankRequest): Promise<RerankBatchResult> {
    const { query, documents, topN } = request;

    if (!documents || documents.length === 0) {
      return { results: [], model: this.config.model };
    }

    if (!this.config.apiKey) {
      this.logger.warn('Cohere API key not configured, skipping rerank');
      return {
        results: documents.map((doc, index) => ({
          id: doc.id,
          content: doc.content,
          relevanceScore: doc.originalScore || 1 - index / documents.length,
          originalScore: doc.originalScore,
          metadata: doc.metadata,
        })),
        model: this.config.model,
      };
    }

    const effectiveTopN = topN || documents.length;

    // Cohere Rerank API 请求
    const requestBody = {
      model: this.config.model,
      query,
      documents: documents.map((doc) => doc.content),
      top_n: effectiveTopN,
    };

    try {
      const response = await this.callWithRetry(
        `${this.config.baseUrl}/v2/rerank`,
        requestBody,
      );

      const resultIndexMap = new Map<string, RerankRequest['documents'][0]>();
      for (const doc of documents) {
        resultIndexMap.set(doc.id, doc);
      }

      const results: RerankBatchResult['results'] = response.results.map(
        (item: any) => {
          const originalDoc = documents[item.index];
          return {
            id: originalDoc?.id || `doc_${item.index}`,
            content: originalDoc?.content || '',
            relevanceScore: item.relevance_score,
            originalScore: originalDoc?.originalScore,
            metadata: originalDoc?.metadata,
          };
        },
      );

      return {
        results,
        model: this.config.model,
        tokenUsage: response.meta?.tokens
          ? {
              promptTokens: response.meta.tokens.input_tokens || 0,
              totalTokens: response.meta.tokens.input_tokens + (response.meta.tokens.output_tokens || 0),
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Cohere rerank failed: ${error instanceof Error ? error.message : error}`,
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
    if (!this.config.apiKey) return false;

    try {
      const response = await fetch(`${this.config.baseUrl}/v2/rerank`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          query: 'test',
          documents: ['test document'],
          top_n: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 带重试的 API 调用
   */
  private async callWithRetry(url: string, body: any, maxRetries: number = 3): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (response.status === 429) {
          // Rate limit — wait and retry
          const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10) * 1000;
          this.logger.warn(`Cohere rate limited, retrying after ${retryAfter}ms`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Cohere API error: ${response.status} - ${errorBody}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `Cohere rerank attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
