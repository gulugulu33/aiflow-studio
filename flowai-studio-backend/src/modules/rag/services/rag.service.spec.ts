import { RAGService } from './rag.service';
import { ConfigService } from '@nestjs/config';

// Minimal PrismaService mock shape used by RAGService
function createPrismaMock() {
  return {
    knowledgeBase: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    document: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    documentChunk: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any;
}

describe('RAGService.uploadDocument filename normalization', () => {
  it('persists normalized filename (mojibake -> intended UTF-8)', async () => {
    const prisma = createPrismaMock();
    const configService: Pick<ConfigService, 'get'> = {
      get: jest.fn().mockReturnValue(''),
    };

    const service = new RAGService(prisma, configService as any);

    jest.spyOn(service, 'findKnowledgeBaseById').mockResolvedValue({
      id: 'kb1',
      userId: 'u1',
    } as any);

    // Avoid embedding + chunk persistence complexity
    (service as any).processDocumentContent = jest
      .fn()
      .mockResolvedValue([{ content: 'chunk', embedding: [] }]);
    (service as any).saveDocumentChunks = jest.fn().mockResolvedValue(undefined);

    prisma.document.findFirst.mockResolvedValue(null);
    prisma.document.create.mockImplementation(async (args: any) => ({
      id: 'doc1',
      ...args.data,
    }));

    const file: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'é®é¢è®°å½.md',
      encoding: '7bit',
      mimetype: 'text/markdown',
      size: 10,
      buffer: Buffer.from('# hello', 'utf8'),
      destination: '',
      filename: '',
      path: '',
      stream: undefined as any,
    };

    const doc = await service.uploadDocument('u1', 'kb1', file);

    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: { name: '问题记录.md', knowledgeBaseId: 'kb1' },
    });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '问题记录.md',
          knowledgeBaseId: 'kb1',
          mimeType: 'text/markdown',
        }),
      })
    );

    expect(doc.name).toBe('问题记录.md');
  });
});
