import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.enablePgvectorExtension();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * 启用 pgvector 扩展
   * pgvector 是 PostgreSQL 的向量相似度搜索扩展
   * 竞品对标: Dify 支持 pgvector 作为默认向量存储后端
   */
  private async enablePgvectorExtension() {
    try {
      await this.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
      this.logger.log('pgvector extension enabled successfully');
    } catch (error) {
      this.logger.warn(
        `Failed to enable pgvector extension: ${error instanceof Error ? error.message : error}. ` +
        `Vector search will not be available. Please ensure pgvector is installed in your PostgreSQL instance.`
      );
    }
  }

  /**
   * 使用 pgvector 进行余弦相似度搜索
   * 替代之前在内存中全量计算相似度的方式，性能从 O(n) 内存计算 → 数据库侧索引加速
   *
   * @param table - 查询的表名
   * @param queryVector - 查询向量
   * @param matchFilter - 额外的 WHERE 条件
   * @param limit - 返回结果数量
   * @param selectFields - 额外需要 SELECT 的字段
   * @returns 相似度排序后的结果
   */
  async vectorSearch(params: {
    table: string;
    queryVector: number[];
    matchFilter?: string;
    limit?: number;
    selectFields?: string[];
  }): Promise<any[]> {
    const { table, queryVector, matchFilter, limit = 5, selectFields = [] } = params;

    const vectorStr = `[${queryVector.join(',')}]`;

    // 构建额外的 SELECT 字段
    const extraSelect = selectFields.length > 0 ? `, ${selectFields.join(', ')}` : '';

    // 构建额外的 WHERE 条件
    const whereClause = matchFilter ? `AND ${matchFilter}` : '';

    // 使用 pgvector 的 <=> 操作符计算余弦距离 (1 - cosine_similarity)
    // ORDER BY embedding <=> queryVector 等价于按余弦相似度降序排列
    const query = `
      SELECT
        id,
        content,
        1 - (embedding <=> '${vectorStr}'::vector) AS similarity
        ${extraSelect}
      FROM ${table}
      WHERE embedding IS NOT NULL
      ${whereClause}
      ORDER BY embedding <=> '${vectorStr}'::vector
      LIMIT ${limit}
    `;

    try {
      return await this.$queryRawUnsafe(query);
    } catch (error) {
      this.logger.error(`Vector search failed: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  /**
   * 插入带有向量数据的记录
   * 使用 Prisma 的 raw query 来处理 Unsupported("vector") 类型字段
   */
  async insertVectorChunk(params: {
    documentId: string;
    content: string;
    embedding: number[];
    chunkIndex: number;
    startIndex: number;
    endIndex: number;
    metadata?: string;
  }): Promise<void> {
    const { documentId, content, embedding, chunkIndex, startIndex, endIndex, metadata } = params;
    const vectorStr = `[${embedding.join(',')}]`;

    await this.$executeRawUnsafe(`
      INSERT INTO document_chunks (id, content, embedding, chunk_index, start_index, end_index, metadata, document_id, created_at)
      VALUES (
        gen_random_uuid(),
        '${content.replace(/'/g, "''")}',
        '${vectorStr}'::vector,
        ${chunkIndex},
        ${startIndex},
        ${endIndex},
        ${metadata ? `'${metadata.replace(/'/g, "''")}'` : 'NULL'},
        '${documentId}',
        NOW()
      )
    `);
  }

  /**
   * 批量插入带有向量数据的记录
   * 比单条插入性能更优，适合文档分块后的批量写入
   */
  async batchInsertVectorChunks(params: {
    documentId: string;
    chunks: {
      content: string;
      embedding: number[];
      chunkIndex: number;
      startIndex: number;
      endIndex: number;
      metadata?: string;
    }[];
  }): Promise<void> {
    const { documentId, chunks } = params;

    if (chunks.length === 0) return;

    const values = chunks.map((chunk) => {
      const vectorStr = `[${chunk.embedding.join(',')}]`;
      const escapedContent = chunk.content.replace(/'/g, "''");
      const metadataValue = chunk.metadata ? `'${chunk.metadata.replace(/'/g, "''")}'` : 'NULL';

      return `(
        gen_random_uuid(),
        '${escapedContent}',
        '${vectorStr}'::vector,
        ${chunk.chunkIndex},
        ${chunk.startIndex},
        ${chunk.endIndex},
        ${metadataValue},
        '${documentId}',
        NOW()
      )`;
    }).join(',\n');

    await this.$executeRawUnsafe(`
      INSERT INTO document_chunks (id, content, embedding, chunk_index, start_index, end_index, metadata, document_id, created_at)
      VALUES ${values}
    `);
  }
}
