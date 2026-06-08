/**
 * 工作流模板市场服务
 *
 * Phase 4.3: 模板市场 — CRUD、分类搜索、一键导入、评分
 *
 * 核心能力:
 * - 从工作流创建模板（快照复制）
 * - 模板列表查询（关键词 + 分类 + 标签 + 排序）
 * - 模板详情查看
 * - 一键从模板创建工作流
 * - 模板评分（加权平均）
 * - 模板发布/下架
 *
 * 竞品对标:
 * - Dify: 有模板市场，但分类有限 → 我们增加标签+搜索+评分
 * - Coze: 有 Bot 商店 → 我们增加了草稿/发布工作流
 * - n8n: 有模板库，按场景分类 → 我们增加了统计和评分
 * - Flowise: 无模板市场 → 完整领先
 * - 本设计: 分类 + 标签 + 搜索 + 评分 + 下载统计 + 官方标识
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { CacheService } from '../../../common/services/cache.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  QueryTemplateDto,
  RateTemplateDto,
  CreateFromTemplateDto,
  TemplateCategory,
} from '../dto/template.dto';

@Injectable()
export class WorkflowTemplateService {
  private readonly logger = new Logger(WorkflowTemplateService.name);

  /** 模板列表缓存前缀 */
  private readonly CACHE_PREFIX = 'template';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================================
  // 创建模板
  // ============================================================

  /**
   * 从工作流创建模板
   *
   * 将指定工作流的 nodes/edges/variables 快照复制到模板中
   */
  async createTemplate(userId: string, dto: CreateTemplateDto) {
    let nodes = '[]';
    let edges = '[]';
    let variables: string | null = null;

    // 如果指定了来源工作流，从工作流复制快照
    if (dto.sourceWorkflowId) {
      const workflow = await this.prisma.workflow.findUnique({
        where: { id: dto.sourceWorkflowId },
        include: { application: { select: { userId: true } } },
      });

      if (!workflow) {
        throw new NotFoundException('Source workflow not found');
      }

      if (workflow.application.userId !== userId) {
        throw new ForbiddenException('You do not have permission to access this workflow');
      }

      nodes = workflow.nodes;
      edges = workflow.edges;
      variables = workflow.variables;
    }

    const template = await this.prisma.workflowTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        screenshot: dto.screenshot,
        category: dto.category,
        tags: JSON.stringify(dto.tags || []),
        nodes,
        edges,
        variables,
        userId,
        isOfficial: dto.isOfficial ?? false,
        status: 'draft',
      },
    });

    this.logger.log(`Created template "${dto.name}" (${template.id})`);

    return this.serializeTemplate(template);
  }

  // ============================================================
  // 查询模板
  // ============================================================

  /**
   * 分页查询模板列表
   *
   * 支持: 关键词搜索、分类筛选、标签筛选、官方标识筛选、排序
   */
  async listTemplates(query: QueryTemplateDto) {
    const {
      keyword,
      category,
      tag,
      isOfficial,
      sort = 'newest',
      page = 1,
      pageSize = 20,
    } = query;

    // 构建 where 条件
    const where: Record<string, any> = {
      status: 'published',
    };

    if (category) {
      where.category = category;
    }

    if (isOfficial !== undefined) {
      where.isOfficial = isOfficial;
    }

    if (tag) {
      // 标签存储为 JSON 数组，使用 LIKE 模糊匹配
      where.tags = { contains: tag };
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    // 排序
    let orderBy: Record<string, any> = { createdAt: 'desc' };
    switch (sort) {
      case 'popular':
        orderBy = { downloadCount: 'desc' };
        break;
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [templates, total] = await Promise.all([
      this.prisma.workflowTemplate.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          screenshot: true,
          category: true,
          tags: true,
          downloadCount: true,
          rating: true,
          ratingCount: true,
          isOfficial: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.workflowTemplate.count({ where }),
    ]);

    return {
      items: templates.map((t: any) => ({
        ...t,
        tags: this.parseJson(t.tags, []),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取模板分类列表（带数量统计）
   */
  async listCategories() {
    const categories = Object.values(TemplateCategory);

    const counts = await Promise.all(
      categories.map(async (cat) => {
        const count = await this.prisma.workflowTemplate.count({
          where: { category: cat, status: 'published' },
        });
        return { category: cat, count };
      }),
    );

    return counts;
  }

  /**
   * 获取模板详情
   */
  async getTemplate(templateId: string) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return this.serializeTemplate(template);
  }

  // ============================================================
  // 更新模板
  // ============================================================

  /**
   * 更新模板信息
   */
  async updateTemplate(userId: string, templateId: string, dto: UpdateTemplateDto) {
    const template = await this.assertOwnership(userId, templateId);

    const updated = await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.screenshot !== undefined && { screenshot: dto.screenshot }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.tags !== undefined && { tags: JSON.stringify(dto.tags) }),
      },
    });

    // 失效缓存
    await this.invalidateCache();

    this.logger.log(`Updated template ${templateId}`);

    return this.serializeTemplate(updated);
  }

  /**
   * 发布模板（draft → published）
   */
  async publishTemplate(userId: string, templateId: string) {
    await this.assertOwnership(userId, templateId);

    const template = await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { status: 'published' },
    });

    await this.invalidateCache();

    this.logger.log(`Published template ${templateId}`);

    return this.serializeTemplate(template);
  }

  /**
   * 下架模板（published → archived）
   */
  async archiveTemplate(userId: string, templateId: string) {
    await this.assertOwnership(userId, templateId);

    const template = await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { status: 'archived' },
    });

    await this.invalidateCache();

    this.logger.log(`Archived template ${templateId}`);

    return this.serializeTemplate(template);
  }

  // ============================================================
  // 一键导入
  // ============================================================

  /**
   * 从模板创建工作流
   *
   * 复制模板的 nodes/edges/variables 到目标应用下的新工作流
   * 同时增加模板的下载计数
   */
  async createFromTemplate(userId: string, templateId: string, dto: CreateFromTemplateDto) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.status !== 'published') {
      throw new BadRequestException('Template is not available for import');
    }

    // 验证目标应用归属权
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
    });

    if (!application) {
      throw new NotFoundException('Target application not found');
    }

    if (application.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this application');
    }

    // 创建新工作流
    const workflow = await this.prisma.workflow.create({
      data: {
        name: dto.name || `${template.name} (副本)`,
        description: template.description
          ? `From template: ${template.name}`
          : null,
        nodes: template.nodes,
        edges: template.edges,
        variables: template.variables,
        applicationId: dto.applicationId,
      },
    });

    // 增加模板下载计数
    await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { downloadCount: { increment: 1 } },
    });

    this.logger.log(
      `Created workflow ${workflow.id} from template ${templateId}`,
    );

    return {
      workflowId: workflow.id,
      name: workflow.name,
      templateName: template.name,
      templateId,
    };
  }

  // ============================================================
  // 评分
  // ============================================================

  /**
   * 对模板评分
   *
   * 使用加权平均算法更新模板评分
   */
  async rateTemplate(userId: string, templateId: string, dto: RateTemplateDto) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.status !== 'published') {
      throw new BadRequestException('Cannot rate an unpublished template');
    }

    // 加权平均计算新评分
    const currentTotal = template.rating * template.ratingCount;
    const newRatingCount = template.ratingCount + 1;
    const newRating = (currentTotal + dto.rating) / newRatingCount;

    const updated = await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        rating: Math.round(newRating * 100) / 100, // 保留2位小数
        ratingCount: newRatingCount,
      },
    });

    this.logger.log(
      `User ${userId} rated template ${templateId}: ${dto.rating} (avg: ${updated.rating})`,
    );

    return {
      rating: updated.rating,
      ratingCount: updated.ratingCount,
      yourRating: dto.rating,
    };
  }

  // ============================================================
  // 删除模板
  // ============================================================

  /**
   * 删除模板（仅创建者可删除）
   */
  async deleteTemplate(userId: string, templateId: string) {
    await this.assertOwnership(userId, templateId);

    await this.prisma.workflowTemplate.delete({
      where: { id: templateId },
    });

    await this.invalidateCache();

    this.logger.log(`Deleted template ${templateId}`);

    return { success: true, deletedId: templateId };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 校验模板归属权
   */
  private async assertOwnership(userId: string, templateId: string) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, userId: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.userId !== userId) {
      throw new ForbiddenException('You do not have permission to modify this template');
    }

    return template;
  }

  /**
   * 序列化模板（解析 JSON 字段）
   */
  private serializeTemplate(template: {
    tags: string;
    nodes: string;
    edges: string;
    variables?: string | null;
    [key: string]: any;
  }): Record<string, any> {
    return {
      ...template,
      tags: this.parseJson(template.tags, []),
      nodes: this.parseJson(template.nodes, []),
      edges: this.parseJson(template.edges, []),
      variables: template.variables ? this.parseJson(template.variables, {}) : null,
    };
  }

  /**
   * 安全 JSON 解析
   */
  private parseJson<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * 失效模板列表缓存
   */
  private async invalidateCache() {
    await this.cacheService.deleteByPrefix(`${this.CACHE_PREFIX}:`).catch(() => {
      // 缓存失效失败不影响主流程
    });
  }
}
