/**
 * 工作流差异对比工具测试
 *
 * Phase 4.2 测试覆盖:
 * - 节点新增/删除/修改检测
 * - 字段级变更检测
 * - 边新增/删除检测
 * - 深度对比
 * - 汇总统计
 */
import { diffWorkflow } from '../utils/workflow-diff.util';

describe('workflow-diff.util', () => {
  describe('diffWorkflow - nodes', () => {
    it('should detect added nodes', () => {
      const oldNodes = [{ id: 'a', type: 'start' }];
      const newNodes = [
        { id: 'a', type: 'start' },
        { id: 'b', type: 'llm' },
      ];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.addedNodes[0].id).toBe('b');
      expect(diff.summary.nodesAdded).toBe(1);
      expect(diff.summary.hasChanges).toBe(true);
    });

    it('should detect removed nodes', () => {
      const oldNodes = [
        { id: 'a', type: 'start' },
        { id: 'b', type: 'llm' },
      ];
      const newNodes = [{ id: 'a', type: 'start' }];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      expect(diff.removedNodes).toHaveLength(1);
      expect(diff.removedNodes[0].id).toBe('b');
      expect(diff.summary.nodesRemoved).toBe(1);
    });

    it('should detect modified node data fields', () => {
      const oldNodes = [
        { id: 'a', type: 'llm', data: { model: 'qwen-turbo', temperature: 0.7 } },
      ];
      const newNodes = [
        { id: 'a', type: 'llm', data: { model: 'gpt-4o', temperature: 0.7 } },
      ];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].id).toBe('a');
      expect(diff.modifiedNodes[0].changes).toHaveLength(1);
      expect(diff.modifiedNodes[0].changes[0]).toEqual({
        field: 'data.model',
        oldValue: 'qwen-turbo',
        newValue: 'gpt-4o',
      });
    });

    it('should detect type change', () => {
      const oldNodes = [{ id: 'a', type: 'llm', data: {} }];
      const newNodes = [{ id: 'a', type: 'agent', data: {} }];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      expect(diff.modifiedNodes[0].changes).toContainEqual({
        field: 'type',
        oldValue: 'llm',
        newValue: 'agent',
      });
    });

    it('should detect added data field', () => {
      const oldNodes = [{ id: 'a', type: 'llm', data: { model: 'qwen-turbo' } }];
      const newNodes = [
        { id: 'a', type: 'llm', data: { model: 'qwen-turbo', systemPrompt: 'hi' } },
      ];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      expect(diff.modifiedNodes[0].changes).toContainEqual({
        field: 'data.systemPrompt',
        oldValue: undefined,
        newValue: 'hi',
      });
    });

    it('should not report unchanged nodes', () => {
      const nodes = [{ id: 'a', type: 'llm', data: { model: 'qwen-turbo' } }];

      const diff = diffWorkflow(nodes, [], nodes, []);

      expect(diff.modifiedNodes).toHaveLength(0);
      expect(diff.summary.hasChanges).toBe(false);
    });

    it('should ignore position-only changes (not in data)', () => {
      const oldNodes = [{ id: 'a', type: 'llm', data: { model: 'q' }, position: { x: 0, y: 0 } }];
      const newNodes = [{ id: 'a', type: 'llm', data: { model: 'q' }, position: { x: 100, y: 200 } }];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      // position 不在 data 中，不应被视为变更
      expect(diff.modifiedNodes).toHaveLength(0);
    });
  });

  describe('diffWorkflow - edges', () => {
    it('should detect added edges', () => {
      const oldEdges = [{ source: 'a', target: 'b' }];
      const newEdges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ];

      const diff = diffWorkflow([], oldEdges, [], newEdges);

      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.addedEdges[0]).toMatchObject({ source: 'b', target: 'c' });
      expect(diff.summary.edgesAdded).toBe(1);
    });

    it('should detect removed edges', () => {
      const oldEdges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ];
      const newEdges = [{ source: 'a', target: 'b' }];

      const diff = diffWorkflow([], oldEdges, [], newEdges);

      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.removedEdges[0]).toMatchObject({ source: 'b', target: 'c' });
    });

    it('should differentiate edges by sourceHandle', () => {
      const oldEdges = [{ source: 'a', target: 'b', sourceHandle: 'true' }];
      const newEdges = [{ source: 'a', target: 'b', sourceHandle: 'false' }];

      const diff = diffWorkflow([], oldEdges, [], newEdges);

      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.removedEdges).toHaveLength(1);
    });

    it('should not report unchanged edges', () => {
      const edges = [{ source: 'a', target: 'b' }];

      const diff = diffWorkflow([], edges, [], edges);

      expect(diff.addedEdges).toHaveLength(0);
      expect(diff.removedEdges).toHaveLength(0);
    });
  });

  describe('diffWorkflow - deep comparison', () => {
    it('should detect nested object changes', () => {
      const oldNodes = [
        { id: 'a', type: 'agent', data: { workers: [{ id: 'w1', model: 'qwen-turbo' }] } },
      ];
      const newNodes = [
        { id: 'a', type: 'agent', data: { workers: [{ id: 'w1', model: 'gpt-4o' }] } },
      ];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].changes[0].field).toBe('data.workers');
    });

    it('should detect array length changes', () => {
      const oldNodes = [{ id: 'a', type: 'agent', data: { toolIds: ['t1'] } }];
      const newNodes = [{ id: 'a', type: 'agent', data: { toolIds: ['t1', 't2'] } }];

      const diff = diffWorkflow(oldNodes, [], newNodes, []);

      expect(diff.modifiedNodes[0].changes[0].field).toBe('data.toolIds');
    });

    it('should treat identical nested arrays as equal', () => {
      const nodes = [{ id: 'a', type: 'agent', data: { toolIds: ['t1', 't2'] } }];

      const diff = diffWorkflow(nodes, [], JSON.parse(JSON.stringify(nodes)), []);

      expect(diff.modifiedNodes).toHaveLength(0);
    });
  });

  describe('diffWorkflow - complex scenario', () => {
    it('should handle a comprehensive diff', () => {
      const oldNodes = [
        { id: 'start', type: 'start', data: {} },
        { id: 'llm', type: 'llm', data: { model: 'qwen-turbo' } },
        { id: 'old_output', type: 'output', data: {} },
      ];
      const oldEdges = [
        { source: 'start', target: 'llm' },
        { source: 'llm', target: 'old_output' },
      ];
      const newNodes = [
        { id: 'start', type: 'start', data: {} },
        { id: 'llm', type: 'llm', data: { model: 'gpt-4o' } }, // modified
        { id: 'new_agent', type: 'agent', data: {} }, // added
      ];
      const newEdges = [
        { source: 'start', target: 'llm' },
        { source: 'llm', target: 'new_agent' }, // added
      ];

      const diff = diffWorkflow(oldNodes, oldEdges, newNodes, newEdges);

      expect(diff.summary.nodesAdded).toBe(1);
      expect(diff.summary.nodesRemoved).toBe(1);
      expect(diff.summary.nodesModified).toBe(1);
      expect(diff.summary.edgesAdded).toBe(1);
      expect(diff.summary.edgesRemoved).toBe(1);
      expect(diff.summary.hasChanges).toBe(true);
    });
  });
});
