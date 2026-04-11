import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { CreateKnowledgeBaseDto } from '../dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from '../dto/update-knowledge-base.dto';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);
  private readonly qwenApiKey: string;
  private readonly qwenBaseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.qwenApiKey = this.configService.get<string>('QWEN_API_KEY')!;
    this.qwenBaseUrl = this.configService.get<string>('QWEN_BASE_URL')!;
  }

  // 知识库管理
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
    const kb = await this.findKnowledgeBaseById(userId, id);

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



  // 文档管理
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

    const chunks = await this.processDocumentContent(content);

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
        status: 'completed',
        knowledgeBaseId,
      },
    });

    // 保存文档块
    await this.saveDocumentChunks(document.id, chunks);

    return document;
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

  // 检索
  async retrieve(query: string, knowledgeBaseId: string, topK: number = 5) {
    // 生成查询向量
    const queryVector = await this.generateEmbedding(query);

    // 获取该知识库下所有的文档块
    const allChunks = await this.prisma.documentChunk.findMany({
      where: {
        document: {
          knowledgeBaseId: knowledgeBaseId
        }
      },
      include: {
        document: {
          select: {
            name: true,
          },
        },
      },
    });

    // 在内存中计算相似度 (针对 SQLite 的权宜之计)
    const scoredChunks = allChunks.map(chunk => {
      const chunkEmbedding = JSON.parse(chunk.embedding || '[]');
      const similarity = this.cosineSimilarity(queryVector, chunkEmbedding);
      return {
        id: chunk.id,
        content: chunk.content,
        documentId: chunk.documentId,
        documentName: chunk.document.name,
        similarity
      };
    });

    // 排序并取 TopK
    return scoredChunks
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

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

  // 文档处理
  private async processDocumentContent(content: string): Promise<{ content: string; embedding: number[] }[]> {
    const chunks = this.splitText(content, 2000, 200).slice(0, 5);

    const chunksWithEmbeddings = await Promise.all(
      chunks.map(async (chunk) => {
        const embedding = await this.generateEmbedding(chunk);
        return { content: chunk, embedding };
      })
    );

    return chunksWithEmbeddings;
  }

  // 文本分块
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

  // 生成向量嵌入
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.qwenApiKey || this.qwenApiKey === 'your-qwen-api-key-here') {
      return [];
    }

    try {
      const response = await axios.post(
        `${this.qwenBaseUrl}/embeddings`,
        {
          model: 'text-embedding-v3',
          input: text,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.qwenApiKey}`,
          },
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      this.logger.warn(`Embedding generation failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  // 保存文档块
  private async saveDocumentChunks(documentId: string, chunks: { content: string; embedding: number[] }[]) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.prisma.documentChunk.createMany({
      data: chunks.map((chunk, index) => ({
        documentId,
        content: chunk.content,
        embedding: JSON.stringify(chunk.embedding),
        chunkIndex: index,
        startIndex: 0,
        endIndex: chunk.content.length,
      })),
    });
  }
}
