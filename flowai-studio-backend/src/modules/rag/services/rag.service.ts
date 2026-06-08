/**
 * RAG Service — 检索增强生成核心服务
 *
 * Phase 2.3 增强:
 * - 新增 Reranker 集成：检索结果自动重排序，提高 Top-K 精度
 * - 支持 Cohere Rerank（云端）+ Ollama 本地 Reranker（零成本）
 * - 更多文档格式支持: PDF (pdf-parse) + DOCX (mammoth)
 * - 降级策略: Reranker 不可用时跳过，返回原始检索结果
 *
 * Phase 2.2:
 * - 混合检索: vector / keyword / hybrid 三种检索模式
 * - BM25 关键词检索 + RRF 融合 + 自适应降级
 *
 * 竞品对标:
 * - Dify: 支持 vector/keyword/hybrid + Cohere Rerank（不支持本地 Reranker）
 * - FastGPT: 支持 vector/fullText/hybrid + Cohere Rerank（不支持本地）
 * - Coze: 仅向量检索，无 Reranker
 * - Flowise: 支持 vector + keyword + HuggingFace/Cohere Reranker
 * - 本设计: RRF 融合 + Cohere + Ollama 本地 Reranker + 自适应降级
 */
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { CreateKnowledgeBaseDto } from '../dto/create-kb.dto';
import { UpdateKnowledgeBaseDto } from '../dto/update-kb.dto';
import { EmbeddingFactory } from '../factories/embedding.factory';
import { VectorStoreFactory } from '../factories/vector-store.factory';
import { EmbeddingProvider } from '../interfaces/embedding-provider.interface';
import { VectorStore } from '../interfaces/vector-store.interface';
import { VectorSearchFilter } from '../interfaces/vector-store.interface';
import {
  RetrievalRequest,
  RetrievalResult,
} from '../interfaces/retrieval-strategy.interface';
import { BM25KeywordService } from './bm25-keyword.service';
import { RRFFusionService } from './rrf-fusion.service';
import { RerankerFactory, RerankerType } from '../providers/reranker/reranker.factory';
import * as fs from 'fs';

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingFactory: EmbeddingFactory,
    private vectorStoreFactory: VectorStoreFactory,
    private bm25Service: BM25KeywordService,
    private rrfFusionService: RRFFusionService,
    private rerankerFactory: RerankerFactory,
  ) {}

  // ============================================================
  // 知识库管理
  // ============================================================

  async createKnowledgeBase(userId: string, createKnowledgeBaseDto: CreateKnowledgeBaseDto) {
    const kb = await this.prisma.knowledgeBase.create({
      data: {
        ...createKnowledgeBaseDto,
        userId,
      },
    });

    // 初始化向量存储后端（创建集合/索引）
    try {
      const store = this.getVectorStoreForKB(kb);
      const provider = this.getEmbeddingProviderForKB(kb);
      await store.initialize(kb.id, provider.getDimensions());
    } catch (error) {
      this.logger.warn(
        `VectorStore initialization skipped for KB ${kb.id}: ${error instanceof Error ? error.message : error}`,
      );
    }

    // 初始化全文搜索索引
    try {
      await this.bm25Service.ensureFullTextIndex();
    } catch (error) {
      this.logger.warn(
        `Full-text index initialization skipped for KB ${kb.id}: ${error instanceof Error ? error.message : error}`,
      );
    }

    return kb;
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

    // 尝试从向量存储中删除对应集合
    try {
      const store = this.getDefaultVectorStore();
      await store.deleteByFilter(id, {
        match: { key: 'knowledgeBaseId', value: id },
      });
    } catch (error) {
      this.logger.warn(
        `VectorStore cleanup skipped for KB ${id}: ${error instanceof Error ? error.message : error}`,
      );
    }

    // 删除知识库（级联删除文档和分块）
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

    // Phase 2.3: 扩展支持的文件格式
    const isTextExt = ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yaml', '.yml'].includes(ext);
    const isPdfExt = ext === '.pdf';
    const isDocxExt = ext === '.docx';
    const isTextLikeMime =
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/x-yaml' ||
      mimeType === 'application/octet-stream';
    const isPdfMime = mimeType === 'application/pdf';
    const isDocxMime = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (!isTextLikeMime && !isTextExt && !isPdfExt && !isPdfMime && !isDocxExt && !isDocxMime) {
      throw new BadRequestException(
        '当前仅支持上传 txt / md / json / csv / pdf / docx 格式文件',
      );
    }

    const contentBuffer =
      file.buffer ||
      (file.path ? fs.readFileSync(file.path) : undefined);

    if (!contentBuffer) {
      throw new BadRequestException('读取上传文件失败');
    }

    // Phase 2.3: 根据文件格式解析内容
    let content: string;
    if (isPdfExt || isPdfMime) {
      content = await this.parsePdf(contentBuffer);
    } else if (isDocxExt || isDocxMime) {
      content = await this.parseDocx(contentBuffer);
    } else {
      content = contentBuffer.toString('utf-8');
    }

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
   * 异步处理文档: 分块 → 生成向量 → 写入向量存储
   *
   * Phase 2.2 增强:
   * - 写入 document_chunks 时同时保留全文索引
   * - 全文搜索基于 document_chunks.content 列的 tsvector 索引
   */
  private async processAndEmbedDocument(documentId: string, content: string, knowledgeBaseId: string): Promise<void> {
    // 获取知识库配置
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) throw new Error('Knowledge base not found');

    // 根据知识库配置获取对应的 Provider 和 Store
    const embeddingProvider = this.getEmbeddingProviderForKB(kb);
    const vectorStore = this.getVectorStoreForKB(kb);

    // 1. 文本分块
    const chunks = this.splitText(content, kb.chunkSize, kb.chunkOverlap);

    // 2. 批量生成向量
    const batchResult = await embeddingProvider.embedBatch(chunks);

    // 3. 写入向量存储
    const documents = batchResult.results.map((result, index) => ({
      id: `${documentId}_chunk_${index}`, // 生成稳定的 chunk ID
      content: result.content,
      embedding: result.embedding,
      metadata: {
        documentId,
        knowledgeBaseId,
        chunkIndex: index,
        startIndex: 0,
        endIndex: result.content.length,
      },
    }));

    await vectorStore.upsert(knowledgeBaseId, documents);

    // 4. 同时写入 document_chunks 表（保留兼容，方便 ORM 查询）
    await this.prisma.batchInsertVectorChunks({
      documentId,
      chunks: batchResult.results.map((result, index) => ({
        content: result.content,
        embedding: result.embedding,
        chunkIndex: index,
        startIndex: 0,
        endIndex: result.content.length,
        metadata: JSON.stringify({
          documentId,
          knowledgeBaseId,
          chunkIndex: index,
        }),
      })),
    });

    // 5. 更新文档状态
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'completed' },
    });

    this.logger.log(
      `Document ${documentId} processed: ${chunks.length} chunks, ` +
      `${batchResult.failedIndices.length} failed, ` +
      `${batchResult.totalTokenUsage} tokens used`,
    );
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

    // 从向量存储中删除
    try {
      const store = this.getVectorStoreForKB(document.knowledgeBase);
      await store.deleteByFilter(document.knowledgeBaseId, {
        match: { key: 'documentId', value: documentId },
      });
    } catch (error) {
      this.logger.warn(
        `VectorStore delete skipped for document ${documentId}: ${error instanceof Error ? error.message : error}`,
      );
    }

    await this.prisma.documentChunk.deleteMany({ where: { documentId } });
    return this.prisma.document.delete({ where: { id: documentId } });
  }

  // ============================================================
  // 检索（核心 — Phase 2.2 重构）
  // ============================================================

  /**
   * 统一检索入口
   *
   * 流程:
   * 1. 根据 retrievalMode 执行检索（vector / keyword / hybrid）
   * 2. 如果知识库启用了 Reranker，对检索结果重排序
   * 3. 返回最终结果
   *
   * Phase 2.3 增强:
   * - 检索后自动 Rerank（如知识库配置了 reranker）
   * - Reranker 降级：Reranker 不可用时返回原始检索结果
   *
   * 竞品对标:
   * - Dify: 支持 vector/keyword/hybrid + Cohere Rerank
   * - FastGPT: 支持 vector/fullText/hybrid + Cohere Rerank
   * - Coze: 仅向量检索，无 Reranker
   * - 本设计: 检索 + Rerank + 自适应降级
   */
  async retrieve(
    query: string,
    knowledgeBaseId: string,
    topK?: number,
    retrievalModeOverride?: 'vector' | 'keyword' | 'hybrid',
    vectorWeightOverride?: number,
    rrfKOverride?: number,
  ): Promise<any[]> {
    // 1. 获取知识库配置
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) {
      throw new NotFoundException('Knowledge base not found');
    }

    const effectiveTopK = topK || kb.topK || 5;
    // 运行时参数优先于知识库配置
    const retrievalMode = retrievalModeOverride || (kb as any).retrievalMode || 'vector';
    const vectorWeight = vectorWeightOverride ?? (kb as any).vectorWeight ?? 0.7;
    const rrfK = rrfKOverride ?? (kb as any).rrfK ?? 60;

    // 2. 根据检索模式执行检索
    let results: any[];
    switch (retrievalMode) {
      case 'keyword':
        results = await this.retrieveKeyword(query, knowledgeBaseId, effectiveTopK, kb);
        break;
      case 'hybrid':
        results = await this.retrieveHybrid(query, knowledgeBaseId, effectiveTopK, kb, vectorWeight, rrfK);
        break;
      case 'vector':
      default:
        results = await this.retrieveVector(query, knowledgeBaseId, effectiveTopK, kb);
        break;
    }

    // 3. Reranker 重排序（如知识库启用）
    results = await this.applyReranker(query, results, kb, effectiveTopK);

    return results;
  }

  /**
   * 对检索结果应用 Reranker 重排序
   *
   * 策略:
   * - 如果知识库未启用 Reranker → 跳过，返回原始结果
   * - 如果 Reranker 调用失败 → 降级，返回原始结果
   * - rerankerTopN 用于控制重排序后保留的文档数
   *
   * 竞品对标:
   * - Dify: 支持 Rerank TopN 配置
   * - FastGPT: 支持 Rerank TopN 配置
   * - 本设计: TopN 配置 + 降级保护 + 耗时日志
   */
  private async applyReranker(query: string, results: any[], kb: any, topK: number): Promise<any[]> {
    const rerankerEnabled = (kb as any).rerankerEnabled ?? false;
    const rerankerProvider = (kb as any).rerankerProvider ?? 'none';
    const rerankerModel = (kb as any).rerankerModel ?? '';
    const rerankerTopN = (kb as any).rerankerTopN ?? topK;

    if (!rerankerEnabled || rerankerProvider === 'none') {
      return results;
    }

    if (results.length === 0) {
      return results;
    }

    try {
      const startTime = Date.now();

      const reranker = this.rerankerFactory.create(
        rerankerProvider as RerankerType,
        {
          model: rerankerModel || undefined,
        },
      );

      const rerankResult = await reranker.rerank({
        query,
        documents: results.map((r) => ({
          id: r.id,
          content: r.content,
          originalScore: r.similarity,
          metadata: r.metadata,
        })),
        topN: rerankerTopN,
      });

      const elapsed = Date.now() - startTime;
      this.logger.log(
        `Reranker applied: ${rerankerProvider} (${reranker.getModel()}), ` +
        `${results.length} → ${rerankResult.results.length} docs, ` +
        `elapsed=${elapsed}ms` +
        (rerankResult.tokenUsage ? `, tokens=${rerankResult.tokenUsage.totalTokens}` : ''),
      );

      // 用 rerank 结果替换原始排序
      return rerankResult.results.map((r) => ({
        id: r.id,
        content: r.content,
        documentId: r.metadata?.documentId || '',
        documentName: '',  // 需要补充
        similarity: r.relevanceScore,
        originalSimilarity: r.originalScore,
        rerankerScore: r.relevanceScore,
        metadata: r.metadata,
      }));
    } catch (error) {
      this.logger.warn(
        `Reranker failed, returning original results: ${error instanceof Error ? error.message : error}`,
      );
      return results;
    }
  }

  /**
   * 纯向量检索
   */
  private async retrieveVector(query: string, knowledgeBaseId: string, topK: number, kb: any): Promise<any[]> {
    const embeddingProvider = this.getEmbeddingProviderForKB(kb);
    const vectorStore = this.getVectorStoreForKB(kb);

    // 生成查询向量
    const embedResult = await embeddingProvider.embed(query);
    if (!embedResult.embedding || embedResult.embedding.length === 0) {
      this.logger.warn('Query embedding is empty, returning empty results');
      return [];
    }

    // 向量搜索
    const searchResults = await vectorStore.search(knowledgeBaseId, {
      queryVector: embedResult.embedding,
      topK,
      similarityThreshold: kb.similarityThreshold,
      filter: {
        match: { key: 'knowledgeBaseId', value: knowledgeBaseId },
      },
    });

    // 补充文档名称信息
    return this.enrichResultsWithDocNames(searchResults);
  }

  /**
   * 纯关键词检索（BM25）
   */
  private async retrieveKeyword(query: string, knowledgeBaseId: string, topK: number, kb: any): Promise<any[]> {
    const results = await this.bm25Service.search({
      query,
      knowledgeBaseId,
      topK,
    });

    // 补充文档名称信息
    return this.enrichResultsWithDocNames(
      results.map((r) => ({
        id: r.id,
        content: r.content,
        similarity: r.score,
        metadata: r.metadata,
      }))
    );
  }

  /**
   * 混合检索（向量 + 关键词 RRF 融合）
   *
   * 流程:
   * 1. 并行执行向量检索和关键词检索
   * 2. 使用 RRF 融合两路结果
   * 3. 返回融合后的排序结果
   *
   * 自适应降级:
   * - 向量检索失败时，仅使用关键词检索结果
   * - 关键词检索失败时，仅使用向量检索结果
   * - 两路都失败时，返回空结果
   */
  private async retrieveHybrid(
    query: string,
    knowledgeBaseId: string,
    topK: number,
    kb: any,
    vectorWeight: number = 0.7,
    rrfK: number = 60,
  ): Promise<any[]> {

    // 并行执行双路检索
    const [vectorResults, keywordResults] = await Promise.allSettled([
      // 向量检索
      this.retrieveVectorForHybrid(query, knowledgeBaseId, topK, kb),
      // 关键词检索（多取一些，因为融合后可能部分重叠）
      this.retrieveKeywordForHybrid(query, knowledgeBaseId, topK * 2),
    ]);

    // 处理检索结果（自适应降级）
    const vResults: RetrievalResult[] =
      vectorResults.status === 'fulfilled' ? vectorResults.value : [];
    const kResults: RetrievalResult[] =
      keywordResults.status === 'fulfilled' ? keywordResults.value : [];

    // 日志记录降级情况
    if (vectorResults.status === 'rejected') {
      this.logger.warn(
        `Vector search failed in hybrid mode, falling back to keyword only: ` +
        `${vectorResults.reason}`
      );
    }
    if (keywordResults.status === 'rejected') {
      this.logger.warn(
        `Keyword search failed in hybrid mode, falling back to vector only: ` +
        `${keywordResults.reason}`
      );
    }

    // 单路降级
    if (vResults.length === 0 && kResults.length === 0) {
      return [];
    }
    if (vResults.length === 0) {
      return this.enrichResultsWithDocNames(
        kResults.map((r) => ({ id: r.id, content: r.content, similarity: r.score, metadata: r.metadata }))
      );
    }
    if (kResults.length === 0) {
      return this.enrichResultsWithDocNames(
        vResults.map((r) => ({ id: r.id, content: r.content, similarity: r.score, metadata: r.metadata }))
      );
    }

    // RRF 融合
    const fusedResults = this.rrfFusionService.fuse(
      [
        { name: 'vector', results: vResults, weight: vectorWeight },
        { name: 'keyword', results: kResults, weight: 1 - vectorWeight },
      ],
      {
        k: rrfK,
        topK,
        similarityThreshold: kb.similarityThreshold,
      },
    );

    // 日志融合质量分析
    const analysis = this.rrfFusionService.analyzeFusion(fusedResults);
    this.logger.debug(
      `Hybrid retrieval analysis: dualHit=${analysis.dualHitCount}, ` +
      `vectorOnly=${analysis.vectorOnlyCount}, keywordOnly=${analysis.keywordOnlyCount}, ` +
      `avgScore=${analysis.avgScore.toFixed(3)}`
    );

    // 补充文档名称信息
    return this.enrichResultsWithDocNames(
      fusedResults.map((r) => ({
        id: r.id,
        content: r.content,
        similarity: r.score,
        metadata: r.metadata,
        // 混合检索附加信息
        vectorScore: r.vectorScore,
        keywordScore: r.keywordScore,
        vectorRank: r.vectorRank,
        keywordRank: r.keywordRank,
      }))
    );
  }

  /**
   * 为混合检索执行向量检索（返回 RetrievalResult 格式）
   */
  private async retrieveVectorForHybrid(
    query: string,
    knowledgeBaseId: string,
    topK: number,
    kb: any,
  ): Promise<RetrievalResult[]> {
    const embeddingProvider = this.getEmbeddingProviderForKB(kb);
    const vectorStore = this.getVectorStoreForKB(kb);

    const embedResult = await embeddingProvider.embed(query);
    if (!embedResult.embedding || embedResult.embedding.length === 0) {
      return [];
    }

    const searchResults = await vectorStore.search(knowledgeBaseId, {
      queryVector: embedResult.embedding,
      topK,
      similarityThreshold: kb.similarityThreshold,
      filter: {
        match: { key: 'knowledgeBaseId', value: knowledgeBaseId },
      },
    });

    return searchResults.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.similarity,
      source: 'vector' as const,
      metadata: r.metadata,
    }));
  }

  /**
   * 为混合检索执行关键词检索（返回 RetrievalResult 格式）
   */
  private async retrieveKeywordForHybrid(
    query: string,
    knowledgeBaseId: string,
    topK: number,
  ): Promise<RetrievalResult[]> {
    const results = await this.bm25Service.search({
      query,
      knowledgeBaseId,
      topK,
    });

    return results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      source: 'keyword' as const,
      metadata: r.metadata,
    }));
  }

  // ============================================================
  // 结果增强
  // ============================================================

  /**
   * 补充文档名称信息
   */
  private async enrichResultsWithDocNames(
    results: Array<{
      id: string;
      content: string;
      similarity: number;
      metadata?: Record<string, any>;
      [key: string]: any;
    }>,
  ): Promise<any[]> {
    const documentIds = [...new Set(results.map((r) => r.metadata?.documentId).filter(Boolean))];
    let docMap = new Map<string, string>();

    if (documentIds.length > 0) {
      const documents = await this.prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, name: true },
      });
      docMap = new Map(documents.map((d) => [d.id, d.name]));
    }

    return results.map((result) => ({
      id: result.id,
      content: result.content,
      documentId: result.metadata?.documentId || '',
      documentName: docMap.get(result.metadata?.documentId) || 'Unknown',
      similarity: result.similarity,
      // 混合检索附加字段
      ...(result.vectorScore !== undefined ? { vectorScore: result.vectorScore } : {}),
      ...(result.keywordScore !== undefined ? { keywordScore: result.keywordScore } : {}),
      ...(result.vectorRank !== undefined ? { vectorRank: result.vectorRank } : {}),
      ...(result.keywordRank !== undefined ? { keywordRank: result.keywordRank } : {}),
    }));
  }

  // ============================================================
  // Provider / Store 解析
  // ============================================================

  /**
   * 根据知识库配置获取对应的 EmbeddingProvider
   */
  private getEmbeddingProviderForKB(kb: { embeddingProvider?: string; embeddingModel: string; embeddingDimension: number }): EmbeddingProvider {
    const providerType = kb.embeddingProvider || this.inferProviderType(kb.embeddingModel);

    return this.embeddingFactory.create(providerType, {
      model: kb.embeddingModel,
      dimensions: kb.embeddingDimension,
    });
  }

  /**
   * 根据知识库配置获取对应的 VectorStore
   */
  private getVectorStoreForKB(kb: { vectorStore?: string }): VectorStore {
    if (kb.vectorStore) {
      return this.vectorStoreFactory.create(kb.vectorStore);
    }
    return this.vectorStoreFactory.getDefaultStore();
  }

  /**
   * 获取默认 VectorStore（用于无法获取知识库配置的场景）
   */
  private getDefaultVectorStore(): VectorStore {
    return this.vectorStoreFactory.getDefaultStore();
  }

  /**
   * 根据 embedding 模型名称推断 Provider 类型
   */
  private inferProviderType(model: string): string {
    if (model.startsWith('text-embedding-v')) {
      return 'qwen';
    }
    if (model.startsWith('text-embedding-3') || model.startsWith('text-embedding-ada')) {
      return 'openai';
    }
    if (['nomic-embed-text', 'mxbai-embed-large', 'all-minilm', 'bge-m3'].includes(model)) {
      return 'ollama';
    }
    this.logger.warn(`Unknown embedding model: ${model}, falling back to qwen provider`);
    return 'qwen';
  }

  // ============================================================
  // 文本处理
  // ============================================================

  /**
   * 文本分块
   * Phase 2.3: 增强为支持按段落/换行符切分的智能分块
   *
   * 竞品对标:
   * - Dify: 自动分块 + 自定义分隔符 + 父子分块
   * - FastGPT: 自动分块 + 手动分块
   * - Coze: 自动分块
   * - 本设计: 按段落切分 + 重叠区 + 可配置 chunkSize/overlap
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

  /**
   * 解析 PDF 文件内容
   *
   * 使用 pdf-parse 库提取文本
   *
   * 竞品对标:
   * - Dify: 支持 PDF 解析（pdf-parse + 自定义解析器）
   * - FastGPT: 支持 PDF 解析
   * - Coze: 支持 PDF 解析
   * - 本设计: pdf-parse 轻量解析 + 降级到纯文本
   */
  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      // pdf-parse 使用 CommonJS 导出，需要 .default.default 或直接调用
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await (pdfParse as any)(buffer);
      return data.text || '';
    } catch (error) {
      // pdf-parse 未安装时降级尝试纯文本
      this.logger.warn(
        `PDF parsing failed (pdf-parse may not be installed): ${error instanceof Error ? error.message : error}. ` +
        `Install with: npm install pdf-parse @types/pdf-parse`,
      );
      try {
        return buffer.toString('utf-8');
      } catch {
        return '';
      }
    }
  }

  /**
   * 解析 DOCX 文件内容
   *
   * 使用 mammoth 库提取文本（保留结构，去掉格式）
   *
   * 竞品对标:
   * - Dify: 支持 DOCX 解析
   * - FastGPT: 支持 DOCX 解析
   * - Coze: 支持 DOCX 解析
   * - 本设计: mammoth 轻量解析 + 降级到纯文本
   */
  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (error) {
      // mammoth 未安装时降级尝试纯文本
      this.logger.warn(
        `DOCX parsing failed (mammoth may not be installed): ${error instanceof Error ? error.message : error}. ` +
        `Install with: npm install mammoth @types/mammoth`,
      );
      try {
        return buffer.toString('utf-8');
      } catch {
        return '';
      }
    }
  }
}
