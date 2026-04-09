import { type Node, type Edge } from "@xyflow/react";

/**
 * Simple vertical layout algorithm for bot flows
 * Arranges nodes in a hierarchical tree-like structure
 */
export const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const nodeWidth = 200;
  const nodeHeight = 120;
  const horizontalSpacing = 100;
  const verticalSpacing = 150;

  // 1. Identify root nodes (nodes with no incoming edges)
  const incomingEdges = new Map<string, number>();
  nodes.forEach(n => incomingEdges.set(n.id, 0));
  edges.forEach(e => {
    incomingEdges.set(e.target, (incomingEdges.get(e.target) || 0) + 1);
  });

  const roots = nodes.filter(n => incomingEdges.get(n.id) === 0);
  
  // If no roots (circular or all connected), just use the first node
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }

  const levels = new Map<string, number>();
  const levelCounts = new Map<number, number>();

  // 2. Assign levels using BFS
  const queue: { id: string; level: number }[] = roots.map(n => ({ id: n.id, level: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    levels.set(id, level);
    levelCounts.set(level, (levelCounts.get(level) || 0) + 1);

    const children = edges.filter(e => e.source === id).map(e => e.target);
    children.forEach(childId => {
      queue.push({ id: childId, level: level + 1 });
    });
  }

  // 3. Position nodes based on levels
  const currentLevelIndices = new Map<number, number>();
  
  const layoutedNodes = nodes.map(node => {
    const level = levels.get(node.id) || 0;
    const count = levelCounts.get(level) || 1;
    const index = currentLevelIndices.get(level) || 0;
    currentLevelIndices.set(level, index + 1);

    // Center the level horizontally
    const x = (index - (count - 1) / 2) * (nodeWidth + horizontalSpacing);
    const y = level * verticalSpacing;

    return {
      ...node,
      position: { x, y },
    };
  });

  return { nodes: layoutedNodes, edges };
};
