import { Injectable } from '@nestjs/common';

@Injectable()
export class TopologicalSorter {
  sort(nodes: any[], edges: any[]): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }

    for (const edge of edges) {
      const neighbors = adjList.get(edge.source);
      if (neighbors) {
        neighbors.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    }

    const queue = nodes.filter((node) => inDegree.get(node.id) === 0).map((node) => node.id);
    const sortedOrder: string[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId) continue;
      
      sortedOrder.push(nodeId);

      const neighbors = adjList.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const currentInDegree = inDegree.get(neighbor) || 0;
          inDegree.set(neighbor, currentInDegree - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }
    }

    if (sortedOrder.length !== nodes.length) {
      throw new Error('Cycle detected in the workflow graph.');
    }

    return sortedOrder;
  }
}
