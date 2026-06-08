/**
 * WorkflowVersionService 单元测试
 *
 * Phase 4.2 测试覆盖:
 * - 创建版本快照（版本号自增）
 * - 版本列表查询
 * - 版本详情查询
 * - 回滚（含自动备份）
 * - 版本对比
 * - 权限校验
 * - 删除版本
 */
import { WorkflowVersionService } from '../services/workflow-version.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('WorkflowVersionService', () => {
  let service: WorkflowVersionService;
  let mockPrisma: any;
  let mockCache: any;

  const ownedWorkflow = {
    id: 'wf_1',
    name: 'Test',
    nodes: JSON.stringify([{ id: 'a', type: 'start', data: {} }]),
    edges: JSON.stringify([]),
    variables: null,
    application: { userId: 'user_1', id: 'app_1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      workflow: {
        findUnique: jest.fn().mockResolvedValue(ownedWorkflow),
        update: jest.fn().mockResolvedValue({ ...ownedWorkflow, currentVersion: 1 }),
      },
      workflowVersion: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockCache = {
      delete: jest.fn().mockResolvedValue(undefined),
      deleteByPrefix: jest.fn().mockResolvedValue(undefined),
    };

    service = new WorkflowVersionService(mockPrisma, mockCache);
  });

  // ============================================================
  // 创建版本
  // ============================================================
  describe('createVersion', () => {
    it('should create first version with version number 1', async () => {
      mockPrisma.workflowVersion.findFirst.mockResolvedValue(null);
      mockPrisma.workflowVersion.create.mockResolvedValue({
        id: 'v_1',
        version: 1,
        nodes: ownedWorkflow.nodes,
        edges: ownedWorkflow.edges,
        variables: null,
      });

      const result = await service.createVersion('user_1', 'wf_1', { label: 'v1' });

      expect(result.version).toBe(1);
      expect(mockPrisma.workflowVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
      );
      expect(mockPrisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentVersion: 1 } }),
      );
    });

    it('should increment version number', async () => {
      mockPrisma.workflowVersion.findFirst.mockResolvedValue({ version: 5 });
      mockPrisma.workflowVersion.create.mockResolvedValue({
        id: 'v_6',
        version: 6,
        nodes: ownedWorkflow.nodes,
        edges: ownedWorkflow.edges,
        variables: null,
      });

      const result = await service.createVersion('user_1', 'wf_1', {});

      expect(result.version).toBe(6);
    });

    it('should throw NotFoundException when workflow not found', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue(null);

      await expect(
        service.createVersion('user_1', 'missing', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue({
        ...ownedWorkflow,
        application: { userId: 'other_user', id: 'app_1' },
      });

      await expect(
        service.createVersion('user_1', 'wf_1', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // 版本列表
  // ============================================================
  describe('listVersions', () => {
    it('should return version list', async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValue([
        { id: 'v_2', version: 2, label: 'v2', isPublished: true },
        { id: 'v_1', version: 1, label: 'v1', isPublished: false },
      ]);

      const result = await service.listVersions('user_1', 'wf_1');

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
    });
  });

  // ============================================================
  // 版本详情
  // ============================================================
  describe('getVersion', () => {
    it('should return version detail with parsed snapshot', async () => {
      mockPrisma.workflowVersion.findUnique.mockResolvedValue({
        id: 'v_1',
        version: 1,
        nodes: JSON.stringify([{ id: 'a', type: 'start' }]),
        edges: JSON.stringify([]),
        variables: null,
      });

      const result = await service.getVersion('user_1', 'wf_1', 1);

      expect(result.version).toBe(1);
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(result.nodes[0].id).toBe('a');
    });

    it('should throw NotFoundException for missing version', async () => {
      mockPrisma.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(
        service.getVersion('user_1', 'wf_1', 99),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // 回滚
  // ============================================================
  describe('rollback', () => {
    it('should rollback to a version and create auto-backup', async () => {
      const targetVersion = {
        version: 2,
        nodes: JSON.stringify([{ id: 'b', type: 'llm' }]),
        edges: JSON.stringify([]),
        variables: null,
      };
      mockPrisma.workflowVersion.findUnique.mockResolvedValue(targetVersion);
      mockPrisma.workflowVersion.findFirst.mockResolvedValue({ version: 3 });
      mockPrisma.workflowVersion.create.mockResolvedValue({ version: 4 });
      mockPrisma.workflow.update.mockResolvedValue({
        id: 'wf_1',
        name: 'Test',
        nodes: targetVersion.nodes,
        edges: targetVersion.edges,
        variables: null,
        currentVersion: 4,
        updatedAt: new Date(),
      });

      const result = await service.rollback('user_1', 'wf_1', 2);

      expect(result.rolledBackTo).toBe(2);
      expect(result.backupVersion).toBe(4);
      // 应创建备份快照
      expect(mockPrisma.workflowVersion.create).toHaveBeenCalled();
      // 工作流内容应恢复为目标版本
      expect(result.nodes[0].id).toBe('b');
      // 缓存应失效
      expect(mockCache.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when rolling back to missing version', async () => {
      mockPrisma.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(
        service.rollback('user_1', 'wf_1', 99),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // 版本对比
  // ============================================================
  describe('compareVersions', () => {
    it('should compare two versions', async () => {
      mockPrisma.workflowVersion.findUnique
        .mockResolvedValueOnce({
          nodes: JSON.stringify([{ id: 'a', type: 'llm', data: { model: 'qwen-turbo' } }]),
          edges: JSON.stringify([]),
        })
        .mockResolvedValueOnce({
          nodes: JSON.stringify([{ id: 'a', type: 'llm', data: { model: 'gpt-4o' } }]),
          edges: JSON.stringify([]),
        });

      const result = await service.compareVersions('user_1', 'wf_1', 1, 2);

      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(2);
      expect(result.diff.summary.nodesModified).toBe(1);
      expect(result.diff.modifiedNodes[0].changes[0].field).toBe('data.model');
    });

    it('should compare version against current state (version 0)', async () => {
      // version 0 = current workflow state
      mockPrisma.workflowVersion.findUnique.mockResolvedValueOnce({
        nodes: JSON.stringify([]),
        edges: JSON.stringify([]),
      });

      const result = await service.compareVersions('user_1', 'wf_1', 1, 0);

      // current state has 1 node (from ownedWorkflow), version 1 has 0 nodes
      expect(result.diff.summary.nodesAdded).toBe(1);
    });

    it('should throw NotFoundException for missing version in compare', async () => {
      mockPrisma.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(
        service.compareVersions('user_1', 'wf_1', 1, 2),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // 删除版本
  // ============================================================
  describe('deleteVersion', () => {
    it('should delete a version', async () => {
      mockPrisma.workflowVersion.findUnique.mockResolvedValue({ version: 1 });
      mockPrisma.workflowVersion.delete.mockResolvedValue({});

      const result = await service.deleteVersion('user_1', 'wf_1', 1);

      expect(result.success).toBe(true);
      expect(result.deletedVersion).toBe(1);
    });

    it('should throw NotFoundException when deleting missing version', async () => {
      mockPrisma.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteVersion('user_1', 'wf_1', 99),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
