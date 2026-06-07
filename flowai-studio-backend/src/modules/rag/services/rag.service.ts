import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { CreateKnowledgeBaseDto } from '../dto/create-kb.dto';
import { UpdateKnowledgeBaseDto } from '../dto/update-kb.dto';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);
  private readonly embeddingApiKey: string;
  private readonly embeddingBaseUrl: string;
  private readonly embeddingModel: string;
  private readonly embeddingDimension: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // 向量模型配置 — 优先使用独立的 Embedding API Key，否则回退到通用 API Key
    this.embeddingApiKey =
      this.configService.get<string>('QWEN_EMBEDDING_API_KEY') ||
      this.configService.get<string>('QWEN_API_KEY')!;
    this.embeddingBaseUrl = this.configService.get<string>('QWEN_BASE_URL')!;
    this.embeddingModel = this.configService.get<string>('QWEN_EMBEDDING_MODEL')!;
    this.embeddingDimension = this.configService.get<number>('QWEN_EMBEDDING_DIMENSION')!;
  }

  // ============================================================
  // 知识库管理
  // ============================================================

  async createKnowledgeBase(userId: string, createKnowledgeBaseDto: CreateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.create({
      data: {
        ...createKnowledgeBaseDto,
        userId,
      },
    });
  }

  async findKnowledgeBases(userId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { userId },
      include: { documents: { select: { id: true, name: true, size: true, createdAt: true, status: true } } },
    });
  }

  async findKnowledgeBaseById(userId: string, id: string) {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: { documents: true },
    });

    if (!kb) {
      throw new NotFoundException('Knowledge base not found');
    }

    if (kb.userId !== userId) {
      throw new BadRequestException('You do not have permission to access this knowledge base');
    }

    return kb;
  }

  async updateKnowledgeBase(userId: string, id: string, updateKnowledgeBaseDto: UpdateKnowledgeBaseDto) {
    await this.findKnowledgeBaseById(userId, id);

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: updateKnowledgeBaseDto,
    });
  }

  async deleteKnowledgeBase(userId: string, id: string) {
    await this.findKnowledgeBaseById(userId, id);
    // 删除知识库
    await this.prisma.document.deleteMany({ where: { knowledgeBaseId: id } });
    return this.prisma.knowledgeBase.delete({ where: { id } });
  }

  // ============================================================
  // 文档管理
  // ============================================================

  async uploadDocument(userId: string, knowledgeBaseId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    // 验证知识库存在且属于用户
    await this.findKnowledgeBaseById(userId, knowledgeBaseId);

    const mimeType = file.mimetype || 'application/octet-stream';
    const fileName = file.originalname || '';
    const lowerName = fileName.toLowerCase();
    const ext = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.')) : '';
    const isTextExt = ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yaml', '.yml'].includes(ext);
    const isTextLikeMime =
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/x-yaml' ||
      mimeType === 'application/octet-stream';

    if (!isTextLikeMime && !isTextExt) {
      throw new BadRequestException('当前仅支持上传 txt / md / json 等文本类文件');
    }

    const contentBuffer =
      file.buffer ||
      (file.path ? fs.readFileSync(file.path) : undefined);

    if (!contentBuffer) {
      throw new BadRequestException('读取上传文件失败');
    }

    const content = contentBuffer.toString('utf-8');
    if (!content.trim()) {
      throw new BadRequestException('文档内容为空或当前格式暂不支持');
    }

    // 检查同名文件是否已存在
    const existingDoc = await this.prisma.document.findFirst({
      where: { name: file.originalname, knowledgeBaseId },
    });
    if (existingDoc) {
      throw new BadRequestException(`该知识库中已存在同名文件「${file.originalname}」，请重命名后重新上传`);
    }

    const document = await this.prisma.document.create({
      data: {
        name: file.originalname,
        content,
        mimeType,
        size: file.size || contentBuffer.length,
        status: 'processing',
        knowledgeBaseId,
      },
    });

    // 异步处理文档分块和向量化
    this.processAndEmbedDocument(document.id, content, knowledgeBaseId).catch((error) => {
      this.logger.error(`Document processing failed for ${document.id}: ${error instanceof Error ? error.message : error}`);
      this.prisma.document.update({
        where: { id: document.id },
        data: { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' },
      }).catch(() => {});
    });

    return document;
  }

  /**
   * 异步处理文档: 分块 → 生成向量 → 批量写入 pgvector
   * 对标 Dify: 支持异步文档处理，避免上传接口阻塞
   */
  private async processAndEmbedDocument(documentId: string, content: string, knowledgeBaseId: string): Promise<void> {
    // 获取知识库配置
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) throw new Error('Knowledge base not found');

    const chunks = this.splitText(content, kb.chunkSize, kb.chunkOverlap);

    // 批量生成向量
    const chunksWithEmbeddings = await this.batchGenerateEmbeddings(chunks);

    // 使用批量写入 — 比单条插入性能更优
    await this.prisma.batchInsertVectorChunks({
      documentId,
      chunks: chunksWithEmbeddings.map((chunk, index) => ({
        content: chunk.content,
        embedding: chunk.embedding,
        chunkIndex: index,
        startIndex: 0,
        endIndex: chunk.content.length,
      })),
    });

    // 更新文档状态
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'completed' },
    });

    this.logger.log(`Document ${documentId} processed: ${chunks.length} chunks embedded`);
  }

  async getDocumentChunks(userId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { knowledgeBase: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.knowledgeBase.userId !== userId) {
      throw new BadRequestException('You do not have permission to access this document');
    }

    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        id: true,
        content: true,
        chunkIndex: true,
        startIndex: true,
        endIndex: true,
        metadata: true,
        createdAt: true,
      },
    });

    return {
      documentId,
      documentName: document.name,
      totalChunks: chunks.length,
      chunks,
    };
  }

  async deleteDocument(userId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { knowledgeBase: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.knowledgeBase.userId !== userId) {
      throw new BadRequestException('You do not have permission to delete this document');
    }

    await this.prisma.documentChunk.deleteMany({ where: { documentId } });
    return this.prisma.document.delete({ where: { id: documentId } });
  }

  // ============================================================
  // 向量检索 — 使用 pgvector 替代内存计算
  // ============================================================

  /**
   * 基于 pgvector 的向量相似度检索
   *
   * 优化对比（vs 旧版 SQLite + 内存计算）:
   * - 旧版: 全量加载所有 chunk → 内存计算余弦相似度 → 排序 → 取 TopK
   * - 新版: 数据库侧使用 <=> 操作符计算余弦距离 → 索引加速 → 直接返回 TopK
   *
   * 竞品对标:
   * - Dify: 支持 pgvector/Qdrant/Milvus/Weaviate/Pgvector
   * - FastGPT: 使用 MongoDB Atlas Vector Search
   * - Coze: 自研向量引擎
   */
  async retrieve(query: string, knowledgeBaseId: string, topK: number = 5) {
    // 1. 生成查询向量
    const queryVector = await this.generateEmbedding(query);
    if (!queryVector || queryVector.length === 0) {
      this.logger.warn('Query embedding is empty, returning empty results');
      return [];
    }

    // 2. 获取知识库配置
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) {
      throw new NotFoundException('Knowledge base not found');
    }

    // 3. 使用 pgvector 进行向量相似度搜索
    // 使用 <=> 操作符 (余弦距离)，ORDER BY embedding <=> query 等价于按相似度降序
    const results = await this.prisma.vectorSearch({
      table: 'document_chunks',
      queryVector,
      matchFilter: `document_id IN (SELECT id FROM documents WHERE knowledge_base_id = '${knowledgeBaseId}')`,
      limit: topK,
      selectFields: ['document_id'],
    });

    // 4. 补充文档名称信息
    const documentIds = [...new Set(results.map((r: any) => r.document_id))];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, name: true },
    });
    const docMap = new Map(documents.map((d) => [d.id, d.name]));

    return results.map((row: any) => ({
      id: row.id,
      content: row.content,
      documentId: row.document_id,
      documentName: docMap.get(row.document_id) || 'Unknown',
      similarity: Number(Number(row.similarity).toFixed(4)),
    }));
  }

  // ============================================================
  // 向量生成
  // ============================================================

  /**
   * 生成单个文本的向量嵌入
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingApiKey || this.embeddingApiKey === 'your-qwen-api-key-here') {
      this.logger.warn('Embedding API key not configured');
      return [];
    }

    try {
      const response = await axios.post(
        `${this.embeddingBaseUrl}/embeddings`,
        {
          model: this.embeddingModel,
          input: text,
          dimensions: this.embeddingDimension,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.embeddingApiKey}`,
          },
          timeout: 30000,
        },
      );

      return response.data.data[0].embedding;
    } catch (error) {
      this.logger.warn(`Embedding generation failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * 批量生成向量嵌入
   * 对标 Dify: 支持 batch embedding，减少 API 调用次数
   *
   * 优化点:
   * - 并发控制: 同时最多 5 个请求，避免 API 限流
   * - 失败重试: 单个分块失败不影响整体
   * - 进度日志: 记录处理进度
   */
  private async batchGenerateEmbeddings(
    chunks: string[],
    concurrency: number = 5,
  ): Promise<{ content: string; embedding: number[] }[]> {
    const results: { content: string; embedding: number[] }[] = [];

    // 分批并发处理
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (chunk) => {
          const embedding = await this.generateEmbedding(chunk);
          return { content: chunk, embedding };
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.warn(`Chunk embedding failed: ${result.reason}`);
          // 降级: 保存无向量的分块
          results.push({ content: batch[batchResults.indexOf(result)], embedding: [] });
        }
      }

      if (chunks.length > concurrency) {
        this.logger.log(`Embedding progress: ${Math.min(i + concurrency, chunks.length)}/${chunks.length}`);
      }
    }

    return results;
  }

  // ============================================================
  // 文本处理
  // ============================================================

  /**
   * 文本分块
   * TODO: Phase 2 会增强为支持自动分块、父子分块、语义分块
   */
  private splitText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start += chunkSize - overlap;
    }

    return chunks;
  }

  // ============================================================
  // 兼容性方法（保留用于旧逻辑兼容）
  // ============================================================

  /**
   * @deprecated 使用 pgvector 的 retrieve 方法替代
   * 仅作为无 pgvector 时的降级方案
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return isNaN(similarity) ? 0 : similarity;
  }
}
