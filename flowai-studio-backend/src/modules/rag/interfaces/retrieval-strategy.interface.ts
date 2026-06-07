/**
 * 检索策略抽象接口
 *
 * Phase 2.2 混合检索核心设计:
 * - 将检索策略抽象为 Strategy 模式，支持 vector / keyword / hybrid 三种模式
 * - 每种策略实现统一的 retrieve 方法
 * - 混合检索策略内部组合 vector + keyword 结果，使用 RRF 融合算法
 *
 * 竞品对标:
 * - Dify: 支持 vector / keyword / hybrid 三种检索模式，hybrid 使用 RRF 融合
 * - FastGPT: 支持 vector / fullText / hybrid，hybrid 使用自定义权重融合
 * - Coze: 仅支持向量检索
 * - Flowise: 支持 vector + keyword (BM25) 双路召回
 * - n8n: 无内置 RAG
 *
 * 本设计优势:
 * - RRF 融合算法无需调参（相比加权融合），对各种查询场景都有稳定表现
 * - BM25 基于 PostgreSQL 全文搜索，零额外部署成本
 * - 支持中文分词（zhparser / pg_jieba 插件）和英文分词
 * - 元数据过滤在向量检索和关键词检索中均支持
 */

/**
 * 检索请求参数
 */
export interface RetrievalRequest {
  /** 查询文本 */
  query: string;
  /** 查询向量（vector/hybrid 模式必需） */
  queryVector?: number[];
  /** 知识库 ID */
  knowledgeBaseId: string;
  /** 返回结果数量 */
  topK?: number;
  /** 相似度阈值（0-1） */
  similarityThreshold?: number;
  /** 元数据过滤条件 */
  filter?: Record<string, any>;
  /** 混合检索权重（仅 hybrid 模式） — 向量检索权重，关键词权重 = 1 - vectorWeight */
  vectorWeight?: number;
  /** RRF 常数 K（默认 60，增大则低排名结果影响增大） */
  rrfK?: number;
}

/**
 * 检索结果项
 */
export interface RetrievalResult {
  /** 文档分块 ID */
  id: string;
  /** 文本内容 */
  content: string;
  /** 相似度分数（0-1，融合后为 RRF 分数归一化值） */
  score: number;
  /** 来源标识：vector / keyword / hybrid */
  source: 'vector' | 'keyword' | 'hybrid';
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 向量检索分数（仅 hybrid 模式有值） */
  vectorScore?: number;
  /** 关键词检索分数（仅 hybrid 模式有值） */
  keywordScore?: number;
  /** 向量检索排名（仅 hybrid 模式有值） */
  vectorRank?: number;
  /** 关键词检索排名（仅 hybrid 模式有值） */
  keywordRank?: number;
}

/**
 * 检索策略接口
 */
export interface RetrievalStrategy {
  /**
   * 执行检索
   * @param request 检索请求参数
   * @returns 检索结果列表
   */
  retrieve(request: RetrievalRequest): Promise<RetrievalResult[]>;

  /**
   * 策略名称
   */
  readonly strategyName: string;
}
