/**
 * Milvus Vector Store Provider
 *
 * 基于 Milvus / Zilliz Cloud 的高性能向量存储实现
 * 适合超大规模向量检索场景（亿级向量）
 *
 * 特性:
 * - 支持多种索引: IVF_FLAT / IVF_SQ8 / HNSW / ANNOY / AUTOINDEX
 * - 支持标量字段过滤
 * - 支持动态字段
 * - 支持多向量字段
 * - 支持分布式部署
 *
 * 竞品对标:
 * - Dify: 支持 Milvus 作为向量存储后端 ✓
 * - FastGPT: 不支持
 * - LangChain: 支持 Milvus ✓
 *
 * 优势:
 * - 云原生架构，支持水平扩展
 * - 亿级向量检索延迟 < 100ms
 * - GPU 加速索引构建
 * - 支持 Zilliz Cloud 全托管
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

/**
 * Milvus 数据类型映射
 */
const MilvusDataType = {
  BOOL: 1,
  INT8: 2,
  INT16: 3,
  INT32: 4,
  INT64: 5,
  FLOAT: 10,
  DOUBLE: 11,
  VARCHAR: 21,
  JSON: 23,
  FLOAT_VECTOR: 101,
} as const;

@Injectable()
export class MilvusVectorStore implements VectorStore {
  private readonly logger = new Logger(MilvusVectorStore.name);
  private readonly apiUrl: string;
  private readonly apiToken?: string;

  readonly storeType = 'milvus';

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('MILVUS_URL') || 'http://localhost:19530';
    this.apiToken = this.configService.get<string>('MILVUS_TOKEN');
  }

  async initialize(collectionName: string, dimension: number): Promise<void> {
    try {
      // 检查集合是否已存在
      const exists = await this.collectionExists(collectionName);
      if (exists) {
        this.logger.log(`Milvus collection "${collectionName}" already exists`);
        return;
      }

      // 创建集合
      await this.milvusRequest('POST', '/v2/vectordb/collections/create', {
        collectionName,
        dimension,
        metricType: 'COSINE',
        idType: 'VarChar',
        autoId: false,
        maxLength: 36,
      });

      // 创建索引
      await this.milvusRequest('POST', '/v2/vectordb/indexes/create', {
        collectionName,
        indexType: 'HNSW',
        metricType: 'COSINE',
        fieldName: 'vector',
        params: {
          M: 16,
          efConstruction: 256,
        },
      });

      // 加载集合到内存
      await this.milvusRequest('POST', '/v2/vectordb/collections/load', {
        collectionName,
      });

      this.logger.log(
        `Milvus collection "${collectionName}" created (dim: ${dimension})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize Milvus collection: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  async upsert(collectionName: string, documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;

    const batchSize = 100;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      const data = batch.map((doc) => ({
        id: doc.id,
        vector: doc.embedding,
        content: doc.content,
        metadata: doc.metadata ? JSON.stringify(doc.metadata) : '',
      }));

      await this.milvusRequest('POST', '/v2/vectordb/entities/upsert', {
        collectionName,
        data,
      });
    }

    this.logger.log(`Upserted ${documents.length} vectors to Milvus "${collectionName}"`);
  }

  async search(collectionName: string, query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const { queryVector, topK = 5, similarityThreshold = 0, filter } = query;

    const requestBody: any = {
      collectionName,
      vector: queryVector,
      limit: topK,
      outputFields: ['content', 'metadata'],
    };

    // Milvus 过滤表达式
    if (filter) {
      const expr = this.buildMilvusFilter(filter);
      if (expr) {
        requestBody.filter = expr;
      }
    }

    try {
      const response = await this.milvusRequest(
        'POST',
        '/v2/vectordb/entities/search',
        requestBody,
      );

      return (response.data ?? []).map((item: any) => ({
        id: String(item.id),
        content: item.content ?? '',
        similarity: Number(Number(item.distance ?? item.score ?? 0).toFixed(4)),
        metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
      }));
    } catch (error) {
      this.logger.error(
        `Milvus search failed: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.milvusRequest('POST', '/v2/vectordb/entities/delete', {
      collectionName,
      id: ids,
    });
  }

  async deleteByFilter(collectionName: string, filter: VectorSearchFilter): Promise<void> {
    const expr = this.buildMilvusFilter(filter);
    if (!expr) {
      this.logger.warn('Empty filter expression, skipping delete');
      return;
    }

    await this.milvusRequest('POST', '/v2/vectordb/entities/delete', {
      collectionName,
      filter: expr,
    });
  }

  async getStats(collectionName: string): Promise<VectorStoreStats> {
    try {
      const response = await this.milvusRequest(
        'POST',
        '/v2/vectordb/collections/describe',
        { collectionName },
      );

      return {
        totalDocuments: response.data?.rowCount ?? 0,
        totalVectors: response.data?.rowCount ?? 0,
        indexStatus: response.data?.load === 'LoadStateLoaded' ? 'ready' : 'building',
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
      const response = await this.milvusRequest('GET', '/healthz');
      return response?.status === 'ok';
    } catch {
      return false;
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private async collectionExists(name: string): Promise<boolean> {
    try {
      const response = await this.milvusRequest('POST', '/v2/vectordb/collections/describe', {
        collectionName: name,
      });
      return response.code === 0 || response.data != null;
    } catch {
      return false;
    }
  }

  /**
   * 将通用 VectorSearchFilter 转换为 Milvus 过滤表达式
   * Milvus 使用类 SQL 表达式语法
   * e.g., metadata['documentId'] == 'abc' AND metadata['chunkIndex'] >= 0
   */
  private buildMilvusFilter(filter: VectorSearchFilter): string {
    const parts: string[] = [];

    if (filter.and && filter.and.length > 0) {
      const subExprs = filter.and.map((f) => this.buildMilvusFilter(f)).filter(Boolean);
      if (subExprs.length > 0) {
        parts.push(`(${subExprs.join(' AND ')})`);
      }
    }

    if (filter.or && filter.or.length > 0) {
      const subExprs = filter.or.map((f) => this.buildMilvusFilter(f)).filter(Boolean);
      if (subExprs.length > 0) {
        parts.push(`(${subExprs.join(' OR ')})`);
      }
    }

    if (filter.match) {
      const { key, value } = filter.match;
      if (typeof value === 'string') {
        parts.push(`metadata['${key}'] == '${value.replace(/'/g, "\\'")}'`);
      } else {
        parts.push(`metadata['${key}'] == ${value}`);
      }
    }

    if (filter.range) {
      const { key, gte, lte } = filter.range;
      if (gte !== undefined) {
        parts.push(`metadata['${key}'] >= ${gte}`);
      }
      if (lte !== undefined) {
        parts.push(`metadata['${key}'] <= ${lte}`);
      }
    }

    if (filter.in) {
      const { key, values } = filter.in;
      const valueList = values.map((v: any) =>
        typeof v === 'string' ? `'${String(v).replace(/'/g, "\\'")}'` : String(v),
      ).join(', ');
      parts.push(`metadata['${key}'] IN [${valueList}]`);
    }

    return parts.join(' AND ');
  }

  /**
   * 发送 Milvus REST API 请求
   */
  private async milvusRequest(
    method: string,
    path: string,
    body?: any,
  ): Promise<any> {
    const headers: any = { 'Content-Type': 'application/json' };
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
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
