/**
 * VectorStore 抽象接口
 *
 * 设计理念:
 * - 将向量存储和检索能力从 PrismaService 中解耦
 * - 支持多种向量数据库: pgvector / Qdrant / Milvus / Weaviate / Chroma
 * - 每个知识库可选择不同的向量存储后端
 *
 * 竞品对标:
 * - Dify: pgvector / Qdrant / Milvus / Weaviate / Opensearch / Pgvector
 * - FastGPT: MongoDB Atlas Vector Search
 * - n8n: 无内置向量存储
 * - LangChain: 抽象 VectorStore 接口 + 30+ 实现
 *
 * 本设计优势:
 * - 统一的 upsert / search / delete 接口
 * - 支持元数据过滤 (metadata filtering)
 * - 支持批量操作，减少网络往返
 * - 相似度阈值过滤在接口层统一处理
 */

/**
 * 向量文档 — 写入向量数据库的基本单元
 */
export interface VectorDocument {
  /** 唯一标识 */
  id: string;
  /** 文本内容 */
  content: string;
  /** 向量嵌入 */
  embedding: number[];
  /** 元数据（用于过滤、来源追踪等） */
  metadata?: Record<string, any>;
}

/**
 * 向量搜索查询参数
 */
export interface VectorSearchQuery {
  /** 查询向量 */
  queryVector: number[];
  /** 返回结果数量 */
  topK?: number;
  /** 相似度阈值（0-1，低于此阈值的结果将被过滤） */
  similarityThreshold?: number;
  /** 元数据过滤条件 */
  filter?: VectorSearchFilter;
  /** 额外需要返回的字段 */
  selectFields?: string[];
}

/**
 * 元数据过滤条件
 * 支持 AND / OR / 比较操作
 */
export interface VectorSearchFilter {
  /** AND 条件列表（所有条件都满足） */
  and?: VectorSearchFilter[];
  /** OR 条件列表（任一条件满足） */
  or?: VectorSearchFilter[];
  /** 字段匹配条件 */
  match?: {
    /** 字段名 */
    key: string;
    /** 匹配值 */
    value: any;
  };
  /** 字段范围条件 */
  range?: {
    /** 字段名 */
    key: string;
    /** 最小值 */
    gte?: number;
    /** 最大值 */
    lte?: number;
  };
  /** 字段值在列表中 */
  in?: {
    key: string;
    values: any[];
  };
}

/**
 * 向量搜索结果项
 */
export interface VectorSearchResult {
  /** 文档 ID */
  id: string;
  /** 文本内容 */
  content: string;
  /** 相似度分数（0-1，越大越相似） */
  similarity: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 向量存储统计信息
 */
export interface VectorStoreStats {
  /** 总文档数 */
  totalDocuments: number;
  /** 总向量数 */
  totalVectors: number;
  /** 存储占用（字节） */
  storageBytes?: number;
  /** 索引状态 */
  indexStatus?: 'building' | 'ready' | 'error';
}

/**
 * VectorStore 抽象接口
 *
 * 所有向量存储后端必须实现此接口
 * 包括: pgvector / Qdrant / Milvus / Weaviate / Chroma 等
 */
export interface VectorStore {
  /**
   * 获取存储类型标识
   * e.g., 'pgvector', 'qdrant', 'milvus', 'weaviate', 'chroma'
   */
  readonly storeType: string;

  /**
   * 初始化存储后端（创建集合/表、索引等）
   *
   * @param collectionName - 集合名称（通常为知识库 ID）
   * @param dimension - 向量维度
   */
  initialize(collectionName: string, dimension: number): Promise<void>;

  /**
   * 插入或更新向量文档
   * 如果 id 已存在则更新，否则插入
   *
   * @param collectionName - 集合名称
   * @param documents - 待写入的向量文档列表
   */
  upsert(collectionName: string, documents: VectorDocument[]): Promise<void>;

  /**
   * 向量相似度搜索
   *
   * @param collectionName - 集合名称
   * @param query - 搜索查询参数
   * @returns 按相似度降序排列的结果列表
   */
  search(collectionName: string, query: VectorSearchQuery): Promise<VectorSearchResult[]>;

  /**
   * 删除指定文档
   *
   * @param collectionName - 集合名称
   * @param ids - 待删除的文档 ID 列表
   */
  delete(collectionName: string, ids: string[]): Promise<void>;

  /**
   * 根据 filter 条件删除文档
   *
   * @param collectionName - 集合名称
   * @param filter - 过滤条件
   */
  deleteByFilter(collectionName: string, filter: VectorSearchFilter): Promise<void>;

  /**
   * 获取存储统计信息
   *
   * @param collectionName - 集合名称
   */
  getStats(collectionName: string): Promise<VectorStoreStats>;

  /**
   * 健康检查 — 验证向量数据库连通性
   *
   * @returns 是否健康
   */
  healthCheck(): Promise<boolean>;
}
