/**
 * BM25 关键词检索服务
 *
 * 基于 PostgreSQL 全文搜索（tsvector + tsquery）实现 BM25-like 关键词检索。
 * 无需额外部署搜索引擎（Elasticsearch / Meilisearch），直接利用 PostgreSQL 原生能力。
 *
 * 设计理念:
 * - 使用 PostgreSQL tsvector 存储文档分块的全文索引
 * - 使用 plainto_tsquery / phraseto_tsquery 进行查询解析
 * - 使用 ts_rank_cd 计算 BM25-like 相关性分数
 * - 支持中文分词（通过 zhparser / pg_jieba 插件或简单字符分词）
 * - 支持元数据过滤
 *
 * 竞品对标:
 * - Dify: 使用 Elasticsearch 或 pgvector 全文搜索
 * - FastGPT: MongoDB Atlas Full-Text Search
 * - Coze: 内置全文搜索
 * - Flowise: Pinecone + BM25 本地实现
 * - LangChain: BM25 (js) 纯内存实现
 *
 * 本设计优势:
 * - 零额外部署（PostgreSQL 原生全文搜索）
 * - 支持 ACID 事务（数据一致性保证）
 * - 自动与 document_chunks 表同步（无需额外索引维护）
 * - 支持中文和英文混合文本
 *
 * 注意:
 * - PostgreSQL 全文搜索使用 ts_rank_cd，分数不是严格的 BM25 分数，
 *   但在实践中的排名效果与 BM25 相近，足以满足 RRF 融合需求
 * - 中文分词需要安装 zhparser 或 pg_jieba 扩展
 *   未安装时使用 simple 分词器（按字符分割），中文检索效果会打折扣
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';

/**
 * BM25 检索参数
 */
export interface BM25SearchParams {
  /** 查询文本 */
  query: string;
  /** 知识库 ID */
  knowledgeBaseId: string;
  /** 返回结果数量 */
  topK?: number;
  /** 元数据过滤条件 */
  filter?: Record<string, any>;
}

/**
 * BM25 检索结果项
 */
export interface BM25SearchResult {
  /** 文档分块 ID */
  id: string;
  /** 文本内容 */
  content: string;
  /** BM25 相关性分数（归一化到 0-1） */
  score: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

@Injectable()
export class BM25KeywordService {
  private readonly logger = new Logger(BM25KeywordService.name);

  /** PostgreSQL 全文搜索配置（尝试中文分词，回退到英文分词） */
  private textSearchConfig: string = 'simple';
  private configDetected: boolean = false;

  constructor(private prisma: PrismaService) {}

  /**
   * 检测 PostgreSQL 全文搜索配置
   * 优先使用中文分词配置（zhparser / pg_jieba），回退到 simple
   */
  async detectTextSearchConfig(): Promise<string> {
    if (this.configDetected) return this.textSearchConfig;

    try {
      // 查询可用的全文搜索配置
      const configs: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT cfgname FROM pg_ts_config WHERE cfgname IN ('zhparser', 'pg_jieba', 'english', 'simple') ORDER BY cfgname`
      );

      // 优先级: zhparser > pg_jieba > english > simple
      const configNames = configs.map((c: any) => c.cfgname);
      if (configNames.includes('zhparser')) {
        this.textSearchConfig = 'zhparser';
        this.logger.log('Detected zhparser Chinese text search config');
      } else if (configNames.includes('pg_jieba')) {
        this.textSearchConfig = 'pg_jieba';
        this.logger.log('Detected pg_jieba Chinese text search config');
      } else if (configNames.includes('english')) {
        this.textSearchConfig = 'english';
        this.logger.log('Using English text search config (Chinese support limited)');
      } else {
        this.textSearchConfig = 'simple';
        this.logger.log('Using simple text search config (character-level tokenization)');
      }
    } catch (error) {
      this.logger.warn(
        `Failed to detect text search config: ${error instanceof Error ? error.message : error}, using simple`
      );
      this.textSearchConfig = 'simple';
    }

    this.configDetected = true;
    return this.textSearchConfig;
  }

  /**
   * 执行 BM25 关键词检索
   *
   * 使用 PostgreSQL 全文搜索:
   * 1. 将查询文本转换为 tsquery
   * 2. 使用 ts_rank_cd 计算相关性分数
   * 3. 对分数进行归一化（0-1 范围）
   * 4. 支持元数据过滤
   *
   * @param params 检索参数
   * @returns 检索结果列表
   */
  async search(params: BM25SearchParams): Promise<BM25SearchResult[]> {
    const { query, knowledgeBaseId, topK = 5, filter } = params;

    if (!query || !query.trim()) {
      return [];
    }

    // 确保已检测全文搜索配置
    const config = await this.detectTextSearchConfig();

    // 构建查询文本 — 同时支持精确短语和单词匹配
    // 使用 plainto_tsquery 自动解析查询文本
    const escapedQuery = query.replace(/'/g, "''");

    // 构建 WHERE 条件
    const conditions: string[] = [];

    // 知识库过滤 — 通过 metadata JSON 字段或关联查询
    conditions.push(`metadata->>'knowledgeBaseId' = '${knowledgeBaseId}'`);

    // 额外元数据过滤
    if (filter) {
      const filterConditions = this.buildFilterConditions(filter);
      if (filterConditions) {
        conditions.push(filterConditions);
      }
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // 使用 ts_rank_cd 计算 BM25-like 相关性分数
    // ts_rank_cd 使用覆盖密度排名，更接近 BM25 的行为
    const sql = `
      SELECT
        id,
        content,
        ts_rank_cd(
          to_tsvector('${config}', content),
          plainto_tsquery('${config}', '${escapedQuery}'),
          32 /* normalization: divide by document length */
        ) AS raw_score,
        metadata
      FROM document_chunks
      WHERE to_tsvector('${config}', content) @@ plainto_tsquery('${config}', '${escapedQuery}')
      ${whereClause}
      ORDER BY raw_score DESC
      LIMIT ${topK}
    `;

    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(sql);

      if (rows.length === 0) {
        return [];
      }

      // 归一化分数到 0-1 范围
      // 使用 max-min 归一化，如果所有分数相同则设为 1.0
      const scores = rows.map((r: any) => Number(r.raw_score));
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const scoreRange = maxScore - minScore;

      return rows.map((row: any) => {
        const rawScore = Number(row.raw_score);
        const normalizedScore = scoreRange > 0
          ? (rawScore - minScore) / scoreRange
          : (rawScore > 0 ? 1.0 : 0.0);

        return {
          id: row.id,
          content: row.content,
          score: Math.min(Math.max(normalizedScore, 0), 1), // clamp to [0, 1]
          metadata: row.metadata
            ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata)
            : undefined,
        };
      });
    } catch (error) {
      this.logger.error(
        `BM25 keyword search failed: ${error instanceof Error ? error.message : error}`
      );
      // 全文搜索失败时回退到 LIKE 模糊匹配
      return this.fallbackLikeSearch(params);
    }
  }

  /**
   * 创建全文搜索索引
   * 在文档入库后调用，为 document_chunks 表创建 tsvector 索引
   */
  async ensureFullTextIndex(): Promise<void> {
    const config = await this.detectTextSearchConfig();

    try {
      // 创建 GIN 索引加速全文搜索
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_document_chunks_content_fts
        ON document_chunks
        USING gin (to_tsvector('${config}', content))
      `);
      this.logger.log(`Full-text search GIN index ensured (config: ${config})`);
    } catch (error) {
      this.logger.warn(
        `Failed to create full-text search index: ${error instanceof Error ? error.message : error}. ` +
        `Full-text search will use sequential scan (slower for large datasets).`
      );
    }
  }

  /**
   * 回退的 LIKE 模糊匹配
   * 当全文搜索不可用时（如缺少 GIN 索引、中文分词插件），使用 LIKE 作为兜底
   */
  private async fallbackLikeSearch(params: BM25SearchParams): Promise<BM25SearchResult[]> {
    const { query, knowledgeBaseId, topK = 5, filter } = params;

    this.logger.warn('Falling back to LIKE search (full-text search unavailable)');

    // 提取查询关键词（简单分词：按空格拆分）
    const keywords = query.trim().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return [];

    // 构建 LIKE 条件
    const likeConditions = keywords
      .map((kw) => `content ILIKE '%${kw.replace(/'/g, "''")}%'`)
      .join(' OR ');

    // 构建 WHERE
    const conditions: string[] = [`(${likeConditions})`];
    conditions.push(`metadata->>'knowledgeBaseId' = '${knowledgeBaseId}'`);

    if (filter) {
      const filterConditions = this.buildFilterConditions(filter);
      if (filterConditions) {
        conditions.push(filterConditions);
      }
    }

    const sql = `
      SELECT
        id,
        content,
        metadata
      FROM document_chunks
      WHERE ${conditions.join(' AND ')}
      LIMIT ${topK}
    `;

    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(sql);

      // LIKE 匹配的分数基于匹配关键词数量和位置
      return rows.map((row: any, index: number) => {
        const content: string = row.content || '';
        let matchCount = 0;
        for (const kw of keywords) {
          const regex = new RegExp(kw, 'gi');
          const matches = content.match(regex);
          if (matches) matchCount += matches.length;
        }
        // 归一化分数：匹配次数 / 关键词数，上限为 1.0
        const score = Math.min(matchCount / (keywords.length * 2), 1.0);

        return {
          id: row.id,
          content,
          score,
          metadata: row.metadata
            ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata)
            : undefined,
        };
      });
    } catch (error) {
      this.logger.error(
        `LIKE fallback search failed: ${error instanceof Error ? error.message : error}`
      );
      return [];
    }
  }

  /**
   * 构建元数据过滤 WHERE 条件
   */
  private buildFilterConditions(filter: Record<string, any>): string {
    const conditions: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'string') {
        conditions.push(`metadata->>'${key}' = '${value.replace(/'/g, "''")}'`);
      } else if (Array.isArray(value)) {
        const valueList = value.map((v: any) => `'${String(v).replace(/'/g, "''")}'`).join(',');
        conditions.push(`metadata->>'${key}' IN (${valueList})`);
      } else if (typeof value === 'object' && value !== null) {
        // Range filter: { gte: 0, lte: 100 }
        if (value.gte !== undefined) {
          conditions.push(`(metadata->>'${key}')::numeric >= ${value.gte}`);
        }
        if (value.lte !== undefined) {
          conditions.push(`(metadata->>'${key}')::numeric <= ${value.lte}`);
        }
      } else {
        conditions.push(`metadata->>'${key}' = '${value}'`);
      }
    }

    return conditions.join(' AND ');
  }
}
