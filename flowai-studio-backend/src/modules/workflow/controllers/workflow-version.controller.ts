/**
 * 工作流版本管理 Controller
 *
 * Phase 4.2: 版本管理 API
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { WorkflowVersionService } from '../services/workflow-version.service';
import { CreateVersionDto } from '../dto/version.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('workflows/:workflowId/versions')
@UseGuards(JwtAuthGuard)
export class WorkflowVersionController {
  constructor(private readonly versionService: WorkflowVersionService) {}

  /**
   * POST /workflows/:workflowId/versions
   * 创建版本快照
   */
  @Post()
  createVersion(
    @CurrentUser('userId') userId: string,
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateVersionDto,
  ) {
    return this.versionService.createVersion(userId, workflowId, dto);
  }

  /**
   * GET /workflows/:workflowId/versions
   * 查询版本列表
   */
  @Get()
  listVersions(
    @CurrentUser('userId') userId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.versionService.listVersions(userId, workflowId);
  }

  /**
   * GET /workflows/:workflowId/versions/compare?from=1&to=2
   * 对比两个版本差异（from/to 为 0 表示当前工作流状态）
   */
  @Get('compare')
  compareVersions(
    @CurrentUser('userId') userId: string,
    @Param('workflowId') workflowId: string,
    @Query('from', ParseIntPipe) from: number,
    @Query('to', ParseIntPipe) to: number,
  ) {
    return this.versionService.compareVersions(userId, workflowId, from, to);
  }

  /**
   * GET /workflows/:workflowId/versions/:version
   * 查询指定版本详情
   */
  @Get(':version')
  getVersion(
    @CurrentUser('userId') userId: string,
    @Param('workflowId') workflowId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.versionService.getVersion(userId, workflowId, version);
  }

  /**
   * POST /workflows/:workflowId/versions/:version/rollback
   * 回滚到指定版本
   */
  @Post(':version/rollback')
  rollback(
    @CurrentUser('userId') userId: string,
    @Param('workflowId') workflowId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.versionService.rollback(userId, workflowId, version);
  }

  /**
   * DELETE /workflows/:workflowId/versions/:version
   * 删除指定版本
   */
  @Delete(':version')
  deleteVersion(
    @CurrentUser('userId') userId: string,
    @Param('workflowId') workflowId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.versionService.deleteVersion(userId, workflowId, version);
  }
}
