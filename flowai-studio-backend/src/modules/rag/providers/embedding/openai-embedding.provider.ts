/**
 * OpenAI Embedding Provider
 *
 * 基于 OpenAI 的向量生成实现
 * 兼容所有 OpenAI 协议的端点（DeepSeek / Azure OpenAI / 自定义代理等）
 *
 * 支持模型:
 * - text-embedding-3-small: 1536 维（默认）
 * - text-embedding-3-large: 3072 维
 * - text-embedding-ada-002: 1536 维（固定维度，不支持 dimensions 参数）
 *
 * 竞品对标:
 * - Dify: 支持 OpenAI Embedding ✓
 * - LangChain: 支持 OpenAI Embedding ✓
 * - Flowise: 支持 OpenAI Embedding ✓
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
} from '../../interfaces/embedding-provider.interface';

@Injectable()
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OpenAIEmbeddingProvider.name);
  private readonly config: EmbeddingProviderConfig;

  readonly providerType = 'openai';

  constructor(config: EmbeddingProviderConfig) {
    this.config = {
      ...config,
      timeout: config.timeout ?? 30000,
      maxConcurrency: config.maxConcurrency ?? 5,
      maxRetries: config.maxRetries ?? 2,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.config.apiKey) {
      this.logger.warn('OpenAI Embedding API key not configured');
      return { embedding: [], tokenUsage: 0 };
    }

    const result = await this.callEmbeddingAPI([text]);
    return {
      embedding: result.embeddings[0] ?? [],
      tokenUsage: result.totalTokens,
    };
  }

  async embedBatch(texts: string[], concurrency?: number): Promise<BatchEmbeddingResult> {
    const maxConcurrency = concurrency ?? this.config.maxConcurrency ?? 5;
    const results: { content: string; embedding: number[]; tokenUsage?: number }[] = [];
    const failedIndices: number[] = [];
    let totalTokenUsage = 0;

    // OpenAI 支持 batch embedding（最多 2048 个输入），但为了并发控制分批处理
    for (let i = 0; i < texts.length; i += maxConcurrency) {
      const batch = texts.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (chunk, batchIdx) => {
          const globalIdx = i + batchIdx;
          const result = await this.embedWithRetry(chunk);
          return { content: chunk, embedding: result.embedding, tokenUsage: result.tokenUsage, globalIdx };
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push({
            content: result.value.content,
            embedding: result.value.embedding,
            tokenUsage: result.value.tokenUsage,
          });
          totalTokenUsage += result.value.tokenUsage ?? 0;
        } else {
          const globalIdx = i + j;
          failedIndices.push(globalIdx);
          results.push({ content: batch[j], embedding: [] });
          this.logger.warn(`Chunk ${globalIdx} embedding failed: ${result.reason}`);
        }
      }

      if (texts.length > maxConcurrency) {
        this.logger.log(
          `Embedding progress: ${Math.min(i + maxConcurrency, texts.length)}/${texts.length}`,
        );
      }
    }

    return { results, failedIndices, totalTokenUsage };
  }

  getDimensions(): number {
    return this.config.dimensions;
  }

  getModel(): string {
    return this.config.model;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testResult = await this.embed('health check');
      return testResult.embedding.length > 0;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private async embedWithRetry(text: string, retries: number = 0): Promise<EmbeddingResult> {
    try {
      return await this.embed(text);
    } catch (error) {
      if (retries < (this.config.maxRetries ?? 2)) {
        this.logger.warn(`Embedding retry ${retries + 1}/${this.config.maxRetries}`);
        await this.sleep(Math.pow(2, retries) * 500);
        return this.embedWithRetry(text, retries + 1);
      }
      throw error;
    }
  }

  /**
   * 调用 OpenAI Embedding API
   * 注意: text-embedding-ada-002 不支持 dimensions 参数
   */
  private async callEmbeddingAPI(texts: string[]): Promise<{ embeddings: number[][]; totalTokens: number }> {
    const isAda002 = this.config.model === 'text-embedding-ada-002';

    const requestBody: any = {
      model: this.config.model,
      input: texts,
    };

    // ada-002 不支持自定义维度
    if (!isAda002 && this.config.dimensions) {
      requestBody.dimensions = this.config.dimensions;
    }

    const response = await axios.post(
      `${this.config.baseUrl}/embeddings`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        timeout: this.config.timeout,
      },
    );

    const embeddings = response.data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);

    return {
      embeddings,
      totalTokens: response.data.usage?.total_tokens ?? 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
