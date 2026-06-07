/**
 * RAG Service — 检索增强生成核心服务
 *
 * 重构说明 (Phase 2.1):
 * - 将硬编码的 Qwen Embedding + pgvector 解耦为 EmbeddingProvider + VectorStore 抽象
 * - 通过 EmbeddingFactory 和 VectorStoreFactory 动态创建实例
 * - 每个知识库可使用不同的 Embedding Provider 和 VectorStore
 * - 保留向后兼容：未配置时回退到默认 Provider（Qwen + pgvector）
 *
 * 竞品对标:
 * - Dify: 支持 Qwen/OpenAI/Azure Embedding + pgvector/Qdrant/Milvus/Weaviate
 * - FastGPT: 支持 Qwen/OpenAI/ChatGLM + MongoDB Atlas Vector
 * - Coze: 仅支持内置模型
 * - Flowise: 支持 OpenAI/HuggingFace/Cohere + Pinecone/Chroma/Qdrant/Weaviate
 */
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { CreateKnowledgeBaseDto } from '../dto/create-kb.dto';
import { UpdateKnowledgeBaseDto } from '../dto/update-kb.dto';
import { EmbeddingFactory } from '../factories/embedding.factory';
import { VectorStoreFactory } from '../factories/vector-store.factory';
import { EmbeddingProvider } from '../interfaces/embedding-provider.interface';
import { VectorStore } from '../interfaces/vector-store.interface';
import * as fs from 'fs';

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingFactory: EmbeddingFactory,
    private vectorStoreFactory: VectorStoreFactory,
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
   * 异步处理文档: 分块 → 生成向量 → 写入向量存储
   *
   * Phase 2.1 重构:
   * - 使用 EmbeddingProvider 替代硬编码的 generateEmbedding
   * - 使用 VectorStore.upsert 替代 prisma.batchInsertVectorChunks
   * - 每个知识库使用各自的 Embedding/VectorStore 配置
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
  // 向量检索
  // ============================================================

  /**
   * 向量相似度检索
   *
   * Phase 2.1 重构:
   * - 使用 EmbeddingProvider 生成查询向量
   * - 使用 VectorStore.search 进行检索
   * - 支持相似度阈值过滤和元数据过滤
   *
   * 竞品对标:
   * - Dify: 支持 pgvector/Qdrant/Milvus + 相似度阈值过滤
   * - FastGPT: MongoDB Atlas Vector Search + 相似度阈值
   * - Coze: 自研向量引擎
   */
  async retrieve(query: string, knowledgeBaseId: string, topK: number = 5) {
    // 1. 获取知识库配置
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) {
      throw new NotFoundException('Knowledge base not found');
    }

    // 2. 根据知识库配置获取 Provider 和 Store
    const embeddingProvider = this.getEmbeddingProviderForKB(kb);
    const vectorStore = this.getVectorStoreForKB(kb);

    // 3. 生成查询向量
    const embedResult = await embeddingProvider.embed(query);
    if (!embedResult.embedding || embedResult.embedding.length === 0) {
      this.logger.warn('Query embedding is empty, returning empty results');
      return [];
    }

    // 4. 向量搜索
    const searchResults = await vectorStore.search(knowledgeBaseId, {
      queryVector: embedResult.embedding,
      topK,
      similarityThreshold: kb.similarityThreshold,
      filter: {
        match: { key: 'knowledgeBaseId', value: knowledgeBaseId },
      },
    });

    // 5. 补充文档名称信息
    const documentIds = [...new Set(searchResults.map((r) => r.metadata?.documentId).filter(Boolean))];
    let docMap = new Map<string, string>();

    if (documentIds.length > 0) {
      const documents = await this.prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, name: true },
      });
      docMap = new Map(documents.map((d) => [d.id, d.name]));
    }

    return searchResults.map((result) => ({
      id: result.id,
      content: result.content,
      documentId: result.metadata?.documentId || '',
      documentName: docMap.get(result.metadata?.documentId) || 'Unknown',
      similarity: result.similarity,
    }));
  }

  // ============================================================
  // Provider / Store 解析
  // ============================================================

  /**
   * 根据知识库配置获取对应的 EmbeddingProvider
   *
   * 策略:
   * 1. 如果知识库指定了 embeddingProvider，使用指定 Provider
   * 2. 否则使用默认 Provider（基于环境变量 EMBEDDING_PROVIDER）
   *
   * 竞品对标:
   * - Dify: 每个知识库可选择不同的 Embedding 模型
   * - FastGPT: 全局配置，所有知识库共用
   * - 本设计: 支持每个知识库独立配置（更灵活）
   */
  private getEmbeddingProviderForKB(kb: { embeddingProvider?: string; embeddingModel: string; embeddingDimension: number }): EmbeddingProvider {
    // 优先使用知识库显式指定的 Provider，否则根据模型名推断
    const providerType = kb.embeddingProvider || this.inferProviderType(kb.embeddingModel);

    return this.embeddingFactory.create(providerType, {
      model: kb.embeddingModel,
      dimensions: kb.embeddingDimension,
    });
  }

  /**
   * 根据知识库配置获取对应的 VectorStore
   *
   * 策略:
   * 1. 如果知识库指定了 vectorStore，使用指定存储
   * 2. 否则使用默认 VectorStore（基于环境变量 VECTOR_STORE）
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
    // Qwen 系列
    if (model.startsWith('text-embedding-v')) {
      return 'qwen';
    }

    // OpenAI 系列
    if (model.startsWith('text-embedding-3') || model.startsWith('text-embedding-ada')) {
      return 'openai';
    }

    // Ollama 系列（常见模型名）
    if (['nomic-embed-text', 'mxbai-embed-large', 'all-minilm', 'bge-m3'].includes(model)) {
      return 'ollama';
    }

    // 默认回退到 Qwen
    this.logger.warn(`Unknown embedding model: ${model}, falling back to qwen provider`);
    return 'qwen';
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
}
