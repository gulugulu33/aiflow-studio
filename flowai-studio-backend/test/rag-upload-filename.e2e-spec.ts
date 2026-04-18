import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { RAGController } from '../src/modules/rag/rag.controller';
import { RAGService } from '../src/modules/rag/services/rag.service';
import { PrismaService } from '../src/common/services/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { userId: 'u1' };
    return true;
  }
}

describe('RAG documents upload (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const prismaMock: Partial<PrismaService> = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'kb1',
          userId: 'u1',
          documents: [],
        }),
      } as any,
      document: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async (args: any) => ({
          id: 'doc1',
          ...args.data,
        })),
        findUnique: jest.fn().mockResolvedValue({ id: 'doc1' }),
      } as any,
      documentChunk: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      } as any,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [RAGController],
      providers: [
        RAGService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();

    // Avoid embeddings and chunk persistence details affecting the e2e test
    const ragService = app.get(RAGService);
    (ragService as any).processDocumentContent = jest
      .fn()
      .mockResolvedValue([{ content: 'chunk', embedding: [] }]);
    (ragService as any).saveDocumentChunks = jest.fn().mockResolvedValue(undefined);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns normalized filename in upload response', async () => {
    await request(app.getHttpServer())
      .post('/rag/documents/upload')
      .field('knowledgeBaseId', 'kb1')
      .attach('file', Buffer.from('# hello', 'utf8'), {
        filename: '问题记录.md',
        contentType: 'text/markdown',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body?.name).toBe('问题记录.md');
      });
  });
});
