/**
 * Ollama Embedding Provider
 *
 * 基于 Ollama 本地部署的向量生成实现
 * 支持在本地 GPU 上运行 Embedding 模型，无需外部 API
 *
 * 支持模型:
 * - nomic-embed-text: 768 维（推荐）
 * - mxbai-embed-large: 1024 维
 * - all-minilm: 384 维（轻量级）
 * - bge-m3: 1024 维（多语言）
 *
 * 竞品对标:
 * - Dify: 支持 Xinference/Ollama 本地模型 ✓
 * - FastGPT: 不支持本地 Embedding
 * - Coze: 不支持本地 Embedding
 *
 * 优势:
 * - 零 API 成本
 * - 数据不出服务器，隐私安全
 * - 无网络延迟，响应更快
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
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OllamaEmbeddingProvider.name);
  private readonly config: EmbeddingProviderConfig;

  readonly providerType = 'ollama';

  constructor(config: EmbeddingProviderConfig) {
    this.config = {
      ...config,
      timeout: config.timeout ?? 60000, // 本地模型可能较慢，默认 60s
      maxConcurrency: config.maxConcurrency ?? 3, // 本地 GPU 并发不宜太高
      maxRetries: config.maxRetries ?? 1,
      baseUrl: config.baseUrl || 'http://localhost:11434',
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/api/embeddings`,
        {
          model: this.config.model,
          prompt: text,
        },
        {
          timeout: this.config.timeout,
        },
      );

      return {
        embedding: response.data.embedding ?? [],
        tokenUsage: 0, // Ollama 不返回 token 统计
      };
    } catch (error) {
      this.logger.warn(
        `Ollama embedding failed: ${error instanceof Error ? error.message : error}`,
      );
      return { embedding: [], tokenUsage: 0 };
    }
  }

  async embedBatch(texts: string[], concurrency?: number): Promise<BatchEmbeddingResult> {
    const maxConcurrency = concurrency ?? this.config.maxConcurrency ?? 3;
    const results: { content: string; embedding: number[]; tokenUsage?: number }[] = [];
    const failedIndices: number[] = [];
    let totalTokenUsage = 0;

    for (let i = 0; i < texts.length; i += maxConcurrency) {
      const batch = texts.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (chunk) => {
          const result = await this.embed(chunk);
          return { content: chunk, embedding: result.embedding, tokenUsage: result.tokenUsage };
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled' && result.value.embedding.length > 0) {
          results.push(result.value);
          totalTokenUsage += result.value.tokenUsage ?? 0;
        } else {
          const globalIdx = i + j;
          failedIndices.push(globalIdx);
          results.push({ content: batch[j], embedding: [] });
          this.logger.warn(`Ollama chunk ${globalIdx} embedding failed`);
        }
      }

      if (texts.length > maxConcurrency) {
        this.logger.log(
          `Ollama embedding progress: ${Math.min(i + maxConcurrency, texts.length)}/${texts.length}`,
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
      const response = await axios.get(`${this.config.baseUrl}/api/tags`, {
        timeout: 5000,
      });
      // 检查指定模型是否存在
      const models: string[] = (response.data.models ?? []).map((m: any) => m.name);
      return models.some((name) => name.startsWith(this.config.model));
    } catch {
      return false;
    }
  }
}
