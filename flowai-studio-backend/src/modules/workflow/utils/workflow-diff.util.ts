/**
 * 工作流差异对比工具
 *
 * Phase 4.2: 版本管理 — 差异对比
 *
 * 对比两个工作流版本的节点和边，产出结构化的差异结果:
 * - 新增/删除/修改的节点
 * - 新增/删除的边
 * - 节点字段级别的变更详情
 *
 * 竞品对标:
 * - Dify: 无可视化 diff，仅有版本列表
 * - n8n: 有版本历史，diff 能力有限
 * - 本设计: 结构化 diff（节点+边+字段级变更），便于前端可视化高亮
 */

export interface WorkflowNode {
  id: string;
  type: string;
  data?: Record<string, any>;
  position?: { x: number; y: number };
  [key: string]: any;
}

export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  [key: string]: any;
}

/** 节点字段变更 */
export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
}

/** 修改的节点 */
export interface ModifiedNode {
  id: string;
  type: string;
  changes: FieldChange[];
}

/** 工作流差异结果 */
export interface WorkflowDiff {
  /** 新增的节点 */
  addedNodes: WorkflowNode[];
  /** 删除的节点 */
  removedNodes: WorkflowNode[];
  /** 修改的节点（含字段级变更） */
  modifiedNodes: ModifiedNode[];
  /** 新增的边 */
  addedEdges: WorkflowEdge[];
  /** 删除的边 */
  removedEdges: WorkflowEdge[];
  /** 汇总统计 */
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    hasChanges: boolean;
  };
}

/**
 * 计算两个工作流版本的差异
 *
 * @param oldNodes 旧版本节点
 * @param oldEdges 旧版本边
 * @param newNodes 新版本节点
 * @param newEdges 新版本边
 */
export function diffWorkflow(
  oldNodes: WorkflowNode[],
  oldEdges: WorkflowEdge[],
  newNodes: WorkflowNode[],
  newEdges: WorkflowEdge[],
): WorkflowDiff {
  const oldNodeMap = new Map(oldNodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newNodes.map((n) => [n.id, n]));

  const addedNodes: WorkflowNode[] = [];
  const removedNodes: WorkflowNode[] = [];
  const modifiedNodes: ModifiedNode[] = [];

  // 找出新增和修改的节点
  for (const newNode of newNodes) {
    const oldNode = oldNodeMap.get(newNode.id);
    if (!oldNode) {
      addedNodes.push(newNode);
    } else {
      const changes = diffNodeFields(oldNode, newNode);
      if (changes.length > 0) {
        modifiedNodes.push({
          id: newNode.id,
          type: newNode.type,
          changes,
        });
      }
    }
  }

  // 找出删除的节点
  for (const oldNode of oldNodes) {
    if (!newNodeMap.has(oldNode.id)) {
      removedNodes.push(oldNode);
    }
  }

  // 边对比（用 source+target+handle 作为唯一标识）
  const edgeKey = (e: WorkflowEdge) =>
    `${e.source}->${e.target}:${e.sourceHandle || ''}:${e.targetHandle || ''}`;

  const oldEdgeKeys = new Set(oldEdges.map(edgeKey));
  const newEdgeKeys = new Set(newEdges.map(edgeKey));

  const addedEdges = newEdges.filter((e) => !oldEdgeKeys.has(edgeKey(e)));
  const removedEdges = oldEdges.filter((e) => !newEdgeKeys.has(edgeKey(e)));

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    summary: {
      nodesAdded: addedNodes.length,
      nodesRemoved: removedNodes.length,
      nodesModified: modifiedNodes.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
      hasChanges:
        addedNodes.length > 0 ||
        removedNodes.length > 0 ||
        modifiedNodes.length > 0 ||
        addedEdges.length > 0 ||
        removedEdges.length > 0,
    },
  };
}

/**
 * 对比单个节点的字段变更
 *
 * 重点对比 data 字段（节点配置），忽略 position（位置变化通常不重要）
 */
function diffNodeFields(oldNode: WorkflowNode, newNode: WorkflowNode): FieldChange[] {
  const changes: FieldChange[] = [];

  // 对比 type
  if (oldNode.type !== newNode.type) {
    changes.push({
      field: 'type',
      oldValue: oldNode.type,
      newValue: newNode.type,
    });
  }

  // 深度对比 data 字段
  const oldData = oldNode.data || {};
  const newData = newNode.data || {};
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldValue = oldData[key];
    const newValue = newData[key];

    if (!deepEqual(oldValue, newValue)) {
      changes.push({
        field: `data.${key}`,
        oldValue,
        newValue,
      });
    }
  }

  return changes;
}

/**
 * 深度相等判断
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual(a[key], b[key]));
}
