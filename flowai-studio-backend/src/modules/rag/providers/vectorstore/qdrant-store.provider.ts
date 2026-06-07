/**
 * Qdrant Vector Store Provider
 *
 * 基于 Qdrant 的高性能向量存储实现
 * 适合大规模向量检索场景
 *
 * 特性:
 * - 支持 HNSW / Flat 索引
 * - 支持精确过滤 + 向量搜索
 * - 支持批量 upsert
 * - 原生支持元数据过滤（payload filtering）
 * - 支持 Cosine / Dot / Euclidean 距离
 *
 * 竞品对标:
 * - Dify: 支持 Qdrant 作为向量存储后端 ✓
 * - LangChain: 支持 Qdrant ✓
 * - n8n: 不支持
 *
 * 优势:
 * - 专为向量搜索优化，性能优于 pgvector
 * - 支持精确过滤 + 向量搜索（filter + search 一体化）
 * - 支持 gRPC 协议（更高吞吐）
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  VectorStore,
  VectorDocument,
  VectorSearchQuery,
  VectorSearchResult,
  VectorSearchFilter,
  VectorStoreStats,
} from '../../interfaces/vector-store.interface';

@Injectable()
export class QdrantVectorStore implements VectorStore {
  private readonly logger = new Logger(QdrantVectorStore.name);
  private readonly apiUrl: string;
  private readonly apiKey?: string;

  readonly storeType = 'qdrant';

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('QDRANT_URL') || 'http://localhost:6333';
    this.apiKey = this.configService.get<string>('QDRANT_API_KEY');
  }

  async initialize(collectionName: string, dimension: number): Promise<void> {
    try {
      // 检查集合是否已存在
      const exists = await this.collectionExists(collectionName);
      if (exists) {
        this.logger.log(`Qdrant collection "${collectionName}" already exists`);
        return;
      }

      // 创建集合
      await this.qdrantRequest('PUT', `/collections/${collectionName}`, {
        vectors: {
          size: dimension,
          distance: 'Cosine',
        },
        hnsw_config: {
          m: 16,
          ef_construct: 100,
        },
        optimizers_config: {
          indexing_threshold: 20000,
        },
      });

      this.logger.log(
        `Qdrant collection "${collectionName}" created (dim: ${dimension})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize Qdrant collection: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  async upsert(collectionName: string, documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;

    // Qdrant 使用 batch upsert（每批最多 100 条）
    const batchSize = 100;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      const points = batch.map((doc) => ({
        id: doc.id,
        vector: doc.embedding,
        payload: {
          content: doc.content,
          ...doc.metadata,
        },
      }));

      await this.qdrantRequest('PUT', `/collections/${collectionName}/points`, {
        points,
        wait: true,
      });
    }

    this.logger.log(`Upserted ${documents.length} vectors to Qdrant "${collectionName}"`);
  }

  async search(collectionName: string, query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const { queryVector, topK = 5, similarityThreshold = 0, filter } = query;

    const requestBody: any = {
      vector: queryVector,
      limit: topK,
      with_payload: true,
    };

    // 相似度阈值（Qdrant 的 score 是 0-1 的余弦相似度）
    if (similarityThreshold > 0) {
      requestBody.score_threshold = similarityThreshold;
    }

    // 过滤条件
    if (filter) {
      requestBody.filter = this.buildQdrantFilter(filter);
    }

    try {
      const response = await this.qdrantRequest(
        'POST',
        `/collections/${collectionName}/points/search`,
        requestBody,
      );

      return (response.result ?? []).map((point: any) => ({
        id: String(point.id),
        content: point.payload?.content ?? '',
        similarity: Number(point.score.toFixed(4)),
        metadata: this.extractMetadata(point.payload),
      }));
    } catch (error) {
      this.logger.error(
        `Qdrant search failed: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.qdrantRequest(
      'POST',
      `/collections/${collectionName}/points/delete`,
      {
        points: ids,
        wait: true,
      },
    );
  }

  async deleteByFilter(collectionName: string, filter: VectorSearchFilter): Promise<void> {
    const qdrantFilter = this.buildQdrantFilter(filter);

    await this.qdrantRequest(
      'POST',
      `/collections/${collectionName}/points/delete`,
      {
        filter: qdrantFilter,
        wait: true,
      },
    );
  }

  async getStats(collectionName: string): Promise<VectorStoreStats> {
    try {
      const response = await this.qdrantRequest(
        'GET',
        `/collections/${collectionName}`,
      );

      return {
        totalDocuments: response.result?.points_count ?? 0,
        totalVectors: response.result?.vectors_count ?? 0,
        indexStatus: response.result?.status === 'green' ? 'ready' : 'building',
      };
    } catch {
      return {
        totalDocuments: 0,
        totalVectors: 0,
        indexStatus: 'error',
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.qdrantRequest('GET', '/healthz');
      return response === 'ok' || response?.status === 'ok';
    } catch {
      return false;
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private async collectionExists(name: string): Promise<boolean> {
    try {
      const response = await this.qdrantRequest('GET', '/collections');
      const collections: any[] = response.result?.collections ?? [];
      return collections.some((c: any) => c.name === name);
    } catch {
      return false;
    }
  }

  /**
   * 将通用 VectorSearchFilter 转换为 Qdrant Filter 格式
   */
  private buildQdrantFilter(filter: VectorSearchFilter): any {
    const qdrantFilter: any = {};

    if (filter.and && filter.and.length > 0) {
      qdrantFilter.must = filter.and
        .map((f) => this.buildQdrantFilter(f))
        .filter(Boolean);
    }

    if (filter.or && filter.or.length > 0) {
      qdrantFilter.should = filter.or
        .map((f) => this.buildQdrantFilter(f))
        .filter(Boolean);
    }

    if (filter.match) {
      const condition = {
        key: filter.match.key,
        match: { value: filter.match.value },
      };
      if (qdrantFilter.must) {
        qdrantFilter.must.push(condition);
      } else {
        qdrantFilter.must = [condition];
      }
    }

    if (filter.range) {
      const rangeCondition: any = {
        key: filter.range.key,
        range: {} as any,
      };
      if (filter.range.gte !== undefined) {
        (rangeCondition.range as any).gte = filter.range.gte;
      }
      if (filter.range.lte !== undefined) {
        (rangeCondition.range as any).lte = filter.range.lte;
      }
      if (qdrantFilter.must) {
        qdrantFilter.must.push(rangeCondition);
      } else {
        qdrantFilter.must = [rangeCondition];
      }
    }

    if (filter.in) {
      const condition = {
        key: filter.in.key,
        match: { any: filter.in.values },
      };
      if (qdrantFilter.must) {
        qdrantFilter.must.push(condition);
      } else {
        qdrantFilter.must = [condition];
      }
    }

    return qdrantFilter;
  }

  /**
   * 从 Qdrant payload 中提取 metadata（排除 content 字段）
   */
  private extractMetadata(payload: any): Record<string, any> | undefined {
    if (!payload) return undefined;
    const { content, ...metadata } = payload;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * 发送 Qdrant API 请求
   */
  private async qdrantRequest(
    method: string,
    path: string,
    body?: any,
  ): Promise<any> {
    const headers: any = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const response = await axios({
      method,
      url: `${this.apiUrl}${path}`,
      data: body,
      headers,
      timeout: 30000,
    });

    return response.data;
  }
}
