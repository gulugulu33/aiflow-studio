/**
 * 工作流模板市场服务测试
 *
 * Phase 4.3: TDD — 模板 CRUD、分类搜索、一键导入、评分
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { WorkflowTemplateService } from '../services/workflow-template.service';
import { PrismaService } from '../../../common/services/prisma.service';
import { CacheService } from '../../../common/services/cache.service';
import { TemplateCategory } from '../dto/template.dto';

describe('WorkflowTemplateService', () => {
  let service: WorkflowTemplateService;
  let mockPrisma: any;
  let mockCache: any;

  beforeEach(async () => {
    mockPrisma = {
      workflowTemplate: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      workflow: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      application: {
        findUnique: jest.fn(),
      },
    };

    mockCache = {
      deleteByPrefix: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<WorkflowTemplateService>(WorkflowTemplateService);
  });

  // ============================================================
  // 创建模板
  // ============================================================
  describe('createTemplate', () => {
    it('should create a template without source workflow', async () => {
      mockPrisma.workflowTemplate.create.mockResolvedValue({
        id: 'tpl_1',
        name: 'Test Template',
        description: 'A test template',
        icon: null,
        screenshot: null,
        category: 'productivity',
        tags: '["AI"]',
        nodes: '[]',
        edges: '[]',
        variables: null,
        userId: 'user_1',
        isOfficial: false,
        status: 'draft',
        downloadCount: 0,
        rating: 0,
        ratingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createTemplate('user_1', {
        name: 'Test Template',
        description: 'A test template',
        category: TemplateCategory.PRODUCTIVITY,
        tags: ['AI'],
      });

      expect(result.name).toBe('Test Template');
      expect(result.tags).toEqual(['AI']);
      expect(result.nodes).toEqual([]);
    });

    it('should create a template from existing workflow', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue({
        id: 'wf_1',
        nodes: JSON.stringify([{ id: 'n1', type: 'llm' }]),
        edges: JSON.stringify([{ id: 'e1', source: 'n1', target: 'n2' }]),
        variables: JSON.stringify({ temp: 1 }),
        application: { userId: 'user_1' },
      });

      mockPrisma.workflowTemplate.create.mockResolvedValue({
        id: 'tpl_2',
        name: 'From Workflow',
        description: null,
        icon: null,
        screenshot: null,
        category: 'content-creation',
        tags: '[]',
        nodes: JSON.stringify([{ id: 'n1', type: 'llm' }]),
        edges: JSON.stringify([{ id: 'e1', source: 'n1', target: 'n2' }]),
        variables: JSON.stringify({ temp: 1 }),
        userId: 'user_1',
        isOfficial: false,
        status: 'draft',
        downloadCount: 0,
        rating: 0,
        ratingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createTemplate('user_1', {
        name: 'From Workflow',
        category: TemplateCategory.CONTENT_CREATION,
        sourceWorkflowId: 'wf_1',
      });

      expect(result.name).toBe('From Workflow');
      expect(result.nodes).toEqual([{ id: 'n1', type: 'llm' }]);
    });

    it('should throw NotFoundException for missing source workflow', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue(null);

      await expect(
        service.createTemplate('user_1', {
          name: 'Test',
          category: TemplateCategory.OTHER,
          sourceWorkflowId: 'wf_missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for another user workflow', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue({
        id: 'wf_1',
        nodes: '[]',
        edges: '[]',
        variables: null,
        application: { userId: 'user_2' },
      });

      await expect(
        service.createTemplate('user_1', {
          name: 'Test',
          category: TemplateCategory.OTHER,
          sourceWorkflowId: 'wf_1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // 查询模板
  // ============================================================
  describe('listTemplates', () => {
    it('should return paginated template list', async () => {
      mockPrisma.workflowTemplate.findMany.mockResolvedValue([
        { id: 'tpl_1', name: 'Template 1', tags: '["AI"]', category: 'productivity' },
      ]);
      mockPrisma.workflowTemplate.count.mockResolvedValue(1);

      const result = await service.listTemplates({ page: 1, pageSize: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].tags).toEqual(['AI']);
    });

    it('should filter by category', async () => {
      mockPrisma.workflowTemplate.findMany.mockResolvedValue([]);
      mockPrisma.workflowTemplate.count.mockResolvedValue(0);

      await service.listTemplates({ category: TemplateCategory.DATA_ANALYSIS });

      expect(mockPrisma.workflowTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'data-analysis' }),
        }),
      );
    });

    it('should search by keyword', async () => {
      mockPrisma.workflowTemplate.findMany.mockResolvedValue([]);
      mockPrisma.workflowTemplate.count.mockResolvedValue(0);

      await service.listTemplates({ keyword: '客服' });

      expect(mockPrisma.workflowTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: '客服', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should sort by download count', async () => {
      mockPrisma.workflowTemplate.findMany.mockResolvedValue([]);
      mockPrisma.workflowTemplate.count.mockResolvedValue(0);

      await service.listTemplates({ sort: 'popular' });

      expect(mockPrisma.workflowTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { downloadCount: 'desc' },
        }),
      );
    });
  });

  // ============================================================
  // 分类统计
  // ============================================================
  describe('listCategories', () => {
    it('should return category counts', async () => {
      mockPrisma.workflowTemplate.count.mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(0);

      const result = await service.listCategories();

      expect(result).toHaveLength(7);
      expect(result[0]).toEqual({ category: 'productivity', count: 5 });
    });
  });

  // ============================================================
  // 获取详情
  // ============================================================
  describe('getTemplate', () => {
    it('should return template detail', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        name: 'Test',
        tags: '["tag1"]',
        nodes: '[{"id":"n1"}]',
        edges: '[]',
        variables: null,
      });

      const result = await service.getTemplate('tpl_1');
      expect(result.name).toBe('Test');
      expect(result.tags).toEqual(['tag1']);
    });

    it('should throw NotFoundException for missing template', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.getTemplate('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // 一键导入
  // ============================================================
  describe('createFromTemplate', () => {
    it('should create workflow from template', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        name: 'AI 客服',
        status: 'published',
        nodes: '[{"id":"n1"}]',
        edges: '[]',
        variables: null,
      });

      mockPrisma.application.findUnique.mockResolvedValue({
        id: 'app_1',
        userId: 'user_1',
      });

      mockPrisma.workflow.create.mockResolvedValue({
        id: 'wf_new',
        name: 'AI 客服 (副本)',
        description: 'From template: AI 客服',
        nodes: '[{"id":"n1"}]',
        edges: '[]',
        variables: null,
        applicationId: 'app_1',
      });

      mockPrisma.workflowTemplate.update.mockResolvedValue({ downloadCount: 1 });

      const result = await service.createFromTemplate('user_1', 'tpl_1', {
        applicationId: 'app_1',
      });

      expect(result.workflowId).toBe('wf_new');
      expect(result.templateName).toBe('AI 客服');
      expect(mockPrisma.workflowTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { downloadCount: { increment: 1 } },
        }),
      );
    });

    it('should throw BadRequestException for unpublished template', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        status: 'draft',
      });

      await expect(
        service.createFromTemplate('user_1', 'tpl_1', { applicationId: 'app_1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for another user application', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        status: 'published',
      });

      mockPrisma.application.findUnique.mockResolvedValue({
        id: 'app_1',
        userId: 'user_2',
      });

      await expect(
        service.createFromTemplate('user_1', 'tpl_1', { applicationId: 'app_1' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // 评分
  // ============================================================
  describe('rateTemplate', () => {
    it('should update template rating with weighted average', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        status: 'published',
        rating: 4.0,
        ratingCount: 2,
      });

      mockPrisma.workflowTemplate.update.mockResolvedValue({
        id: 'tpl_1',
        rating: 4.33,
        ratingCount: 3,
      });

      const result = await service.rateTemplate('user_1', 'tpl_1', { rating: 5 });

      // (4.0 * 2 + 5) / 3 = 4.33
      expect(result.rating).toBe(4.33);
      expect(result.ratingCount).toBe(3);
      expect(result.yourRating).toBe(5);
    });

    it('should throw BadRequestException for unpublished template', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        status: 'draft',
        rating: 0,
        ratingCount: 0,
      });

      await expect(
        service.rateTemplate('user_1', 'tpl_1', { rating: 4 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // 发布/下架/删除
  // ============================================================
  describe('publish/archive/delete', () => {
    it('should publish template', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        userId: 'user_1',
      });
      mockPrisma.workflowTemplate.update.mockResolvedValue({
        id: 'tpl_1',
        status: 'published',
        tags: '[]',
        nodes: '[]',
        edges: '[]',
        variables: null,
      });

      const result = await service.publishTemplate('user_1', 'tpl_1');
      expect(result.status).toBe('published');
    });

    it('should throw ForbiddenException when publishing others template', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        userId: 'user_2',
      });

      await expect(
        service.publishTemplate('user_1', 'tpl_1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete template', async () => {
      mockPrisma.workflowTemplate.findUnique.mockResolvedValue({
        id: 'tpl_1',
        userId: 'user_1',
      });
      mockPrisma.workflowTemplate.delete.mockResolvedValue({ id: 'tpl_1' });

      const result = await service.deleteTemplate('user_1', 'tpl_1');
      expect(result.success).toBe(true);
    });
  });
});
