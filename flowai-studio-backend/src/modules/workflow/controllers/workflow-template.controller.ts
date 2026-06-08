/**
 * 工作流模板市场控制器
 *
 * Phase 4.3: 模板市场 REST API
 *
 * 端点:
 * - POST   /templates                       创建模板
 * - GET    /templates                       查询模板列表（支持搜索/筛选/分页）
 * - GET    /templates/categories            获取分类列表（带统计）
 * - GET    /templates/:id                   获取模板详情
 * - PATCH  /templates/:id                   更新模板
 * - POST   /templates/:id/publish           发布模板
 * - POST   /templates/:id/archive           下架模板
 * - POST   /templates/:id/import            一键导入（从模板创建工作流）
 * - POST   /templates/:id/rate              评分
 * - DELETE /templates/:id                   删除模板
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorkflowTemplateService } from '../services/workflow-template.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  QueryTemplateDto,
  RateTemplateDto,
  CreateFromTemplateDto,
} from '../dto/template.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class WorkflowTemplateController {
  constructor(private readonly templateService: WorkflowTemplateService) {}

  /** 创建模板 */
  @Post()
  createTemplate(@Req() req: any, @Body() dto: CreateTemplateDto) {
    return this.templateService.createTemplate(req.user.userId, dto);
  }

  /** 查询模板列表 */
  @Get()
  listTemplates(@Query() query: QueryTemplateDto) {
    return this.templateService.listTemplates(query);
  }

  /** 获取分类统计 */
  @Get('categories')
  listCategories() {
    return this.templateService.listCategories();
  }

  /** 获取模板详情 */
  @Get(':id')
  getTemplate(@Param('id') id: string) {
    return this.templateService.getTemplate(id);
  }

  /** 更新模板 */
  @Patch(':id')
  updateTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.updateTemplate(req.user.userId, id, dto);
  }

  /** 发布模板 */
  @Post(':id/publish')
  publishTemplate(@Req() req: any, @Param('id') id: string) {
    return this.templateService.publishTemplate(req.user.userId, id);
  }

  /** 下架模板 */
  @Post(':id/archive')
  archiveTemplate(@Req() req: any, @Param('id') id: string) {
    return this.templateService.archiveTemplate(req.user.userId, id);
  }

  /** 一键导入：从模板创建工作流 */
  @Post(':id/import')
  createFromTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateFromTemplateDto,
  ) {
    return this.templateService.createFromTemplate(req.user.userId, id, dto);
  }

  /** 评分 */
  @Post(':id/rate')
  rateTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RateTemplateDto,
  ) {
    return this.templateService.rateTemplate(req.user.userId, id, dto);
  }

  /** 删除模板 */
  @Delete(':id')
  deleteTemplate(@Req() req: any, @Param('id') id: string) {
    return this.templateService.deleteTemplate(req.user.userId, id);
  }
}
