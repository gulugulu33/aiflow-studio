/**
 * Qwen Embedding Provider
 *
 * 基于阿里云通义千问的向量生成实现
 * 使用 OpenAI 兼容协议 (dashscope compatible-mode/v1)
 *
 * 支持模型:
 * - text-embedding-v1: 768 维
 * - text-embedding-v2: 1536 维
 * - text-embedding-v3: 1024 维（默认，推荐）
 *
 * 竞品对标:
 * - Dify: 支持 Qwen Embedding
 * - FastGPT: 支持 Qwen Embedding
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
export class QwenEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(QwenEmbeddingProvider.name);
  private readonly config: EmbeddingProviderConfig;

  readonly providerType = 'qwen';

  constructor(config: EmbeddingProviderConfig) {
    this.config = {
      timeout: 30000,
      maxConcurrency: 5,
      maxRetries: 2,
      ...config,
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.config.apiKey || this.config.apiKey === 'your-qwen-api-key-here') {
      this.logger.warn('Qwen Embedding API key not configured');
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

    // 分批并发处理
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

      // 进度日志
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

  /**
   * 带重试的向量生成
   */
  private async embedWithRetry(text: string, retries: number = 0): Promise<EmbeddingResult> {
    try {
      return await this.embed(text);
    } catch (error) {
      if (retries < (this.config.maxRetries ?? 2)) {
        this.logger.warn(`Embedding retry ${retries + 1}/${this.config.maxRetries} for text: "${text.substring(0, 50)}..."`);
        // 指数退避
        await this.sleep(Math.pow(2, retries) * 500);
        return this.embedWithRetry(text, retries + 1);
      }
      throw error;
    }
  }

  /**
   * 调用 Qwen Embedding API
   * 使用 OpenAI 兼容协议格式
   */
  private async callEmbeddingAPI(texts: string[]): Promise<{ embeddings: number[][]; totalTokens: number }> {
    const response = await axios.post(
      `${this.config.baseUrl}/embeddings`,
      {
        model: this.config.model,
        input: texts,
        dimensions: this.config.dimensions,
      },
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
