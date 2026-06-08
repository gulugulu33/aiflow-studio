/**
 * 工作流版本管理服务
 *
 * Phase 4.2: 版本管理 — 快照、回滚、差异对比
 *
 * 核心能力:
 * - 创建版本快照（保存当前工作流状态）
 * - 版本列表查询
 * - 查看指定版本详情
 * - 回滚到指定版本
 * - 两个版本之间的差异对比
 *
 * 竞品对标:
 * - Dify: 有版本发布/回滚，无可视化 diff
 * - Coze: 有版本管理
 * - n8n: 有版本历史
 * - 本设计: 快照 + 回滚 + 结构化 diff + 草稿/发布区分
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { CacheService } from '../../../common/services/cache.service';
import { CachePrefix } from '../../../common/decorators/cache.decorator';
import { CreateVersionDto } from '../dto/version.dto';
import { diffWorkflow, WorkflowDiff } from '../utils/workflow-diff.util';

@Injectable()
export class WorkflowVersionService {
  private readonly logger = new Logger(WorkflowVersionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 校验工作流归属权
   */
  private async assertOwnership(userId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        application: { select: { userId: true, id: true } },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.application.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this workflow');
    }

    return workflow;
  }

  /**
   * 创建版本快照
   *
   * 保存当前工作流状态为一个新版本，版本号自增
   */
  async createVersion(
    userId: string,
    workflowId: string,
    dto: CreateVersionDto,
  ) {
    const workflow = await this.assertOwnership(userId, workflowId);

    // 计算下一个版本号
    const latestVersion = await this.prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version || 0) + 1;

    const version = await this.prisma.workflowVersion.create({
      data: {
        workflowId,
        version: nextVersion,
        label: dto.label,
        description: dto.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        variables: workflow.variables,
        createdBy: userId,
        isPublished: dto.isPublished ?? false,
      },
    });

    // 更新工作流的当前版本号
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { currentVersion: nextVersion },
    });

    this.logger.log(`Created version ${nextVersion} for workflow ${workflowId}`);

    return this.serializeVersion(version);
  }

  /**
   * 查询版本列表（不含完整快照内容，仅元数据）
   */
  async listVersions(userId: string, workflowId: string) {
    await this.assertOwnership(userId, workflowId);

    const versions = await this.prisma.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        label: true,
        description: true,
        createdBy: true,
        isPublished: true,
        createdAt: true,
      },
    });

    return versions;
  }

  /**
   * 查询指定版本详情（含完整快照）
   */
  async getVersion(userId: string, workflowId: string, version: number) {
    await this.assertOwnership(userId, workflowId);

    const versionRecord = await this.prisma.workflowVersion.findUnique({
      where: { workflowId_version: { workflowId, version } },
    });

    if (!versionRecord) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    return this.serializeVersion(versionRecord);
  }

  /**
   * 回滚到指定版本
   *
   * 回滚前会自动创建当前状态的快照（防止丢失），然后将工作流恢复到目标版本
   */
  async rollback(userId: string, workflowId: string, version: number): Promise<Record<string, any>> {
    const workflow = await this.assertOwnership(userId, workflowId);

    const target = await this.prisma.workflowVersion.findUnique({
      where: { workflowId_version: { workflowId, version } },
    });

    if (!target) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    // 回滚前自动保存当前状态为快照（安全网）
    const latestVersion = await this.prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const backupVersion = (latestVersion?.version || 0) + 1;

    await this.prisma.workflowVersion.create({
      data: {
        workflowId,
        version: backupVersion,
        label: `回滚前自动备份 (来自 v${version})`,
        description: `回滚到 v${version} 前的自动快照`,
        nodes: workflow.nodes,
        edges: workflow.edges,
        variables: workflow.variables,
        createdBy: userId,
        isPublished: false,
      },
    });

    // 将工作流恢复到目标版本内容
    const updated = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        nodes: target.nodes,
        edges: target.edges,
        variables: target.variables,
        currentVersion: backupVersion,
      },
      select: {
        id: true,
        name: true,
        nodes: true,
        edges: true,
        variables: true,
        currentVersion: true,
        updatedAt: true,
      },
    });

    // 失效缓存
    await this.invalidateCache(workflowId, workflow.application.id);

    this.logger.log(
      `Rolled back workflow ${workflowId} to version ${version} (backup saved as v${backupVersion})`,
    );

    return {
      ...updated,
      nodes: this.parseJson(updated.nodes, []),
      edges: this.parseJson(updated.edges, []),
      variables: updated.variables ? this.parseJson(updated.variables, {}) : null,
      rolledBackTo: version,
      backupVersion,
    };
  }

  /**
   * 对比两个版本的差异
   *
   * @param fromVersion 源版本号（0 表示当前工作流状态）
   * @param toVersion 目标版本号（0 表示当前工作流状态）
   */
  async compareVersions(
    userId: string,
    workflowId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<{
    fromVersion: number;
    toVersion: number;
    diff: WorkflowDiff;
  }> {
    const workflow = await this.assertOwnership(userId, workflowId);

    const getSnapshot = async (v: number) => {
      if (v === 0) {
        // 0 表示当前工作流状态
        return { nodes: workflow.nodes, edges: workflow.edges };
      }
      const record = await this.prisma.workflowVersion.findUnique({
        where: { workflowId_version: { workflowId, version: v } },
        select: { nodes: true, edges: true },
      });
      if (!record) {
        throw new NotFoundException(`Version ${v} not found`);
      }
      return record;
    };

    const fromSnap = await getSnapshot(fromVersion);
    const toSnap = await getSnapshot(toVersion);

    const diff = diffWorkflow(
      this.parseJson(fromSnap.nodes, []),
      this.parseJson(fromSnap.edges, []),
      this.parseJson(toSnap.nodes, []),
      this.parseJson(toSnap.edges, []),
    );

    return { fromVersion, toVersion, diff };
  }

  /**
   * 删除指定版本
   */
  async deleteVersion(userId: string, workflowId: string, version: number) {
    await this.assertOwnership(userId, workflowId);

    const record = await this.prisma.workflowVersion.findUnique({
      where: { workflowId_version: { workflowId, version } },
    });

    if (!record) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    await this.prisma.workflowVersion.delete({
      where: { workflowId_version: { workflowId, version } },
    });

    return { success: true, deletedVersion: version };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private serializeVersion(version: {
    nodes: string;
    edges: string;
    variables?: string | null;
    [key: string]: any;
  }): Record<string, any> {
    return {
      ...version,
      nodes: this.parseJson(version.nodes, []),
      edges: this.parseJson(version.edges, []),
      variables: version.variables ? this.parseJson(version.variables, {}) : null,
    };
  }

  private parseJson<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private async invalidateCache(workflowId: string, applicationId: string) {
    await Promise.allSettled([
      this.cacheService.delete(`${CachePrefix.WORKFLOW}:detail:${workflowId}`),
      this.cacheService.deleteByPrefix(`${CachePrefix.WORKFLOW}:list:${applicationId}`),
    ]);
  }
}
