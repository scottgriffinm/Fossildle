import type { NodeStatus, TreeNodeView } from "./tree-view";

export type CladogramMetrics = {
  rowHeight: number;
  rail: number;
  charWidth: number;
  labelPadX: number;
};

/** Tight leaf packing; columns sized from label estimates. */
export const DEFAULT_METRICS: CladogramMetrics = {
  rowHeight: 16,
  rail: 12,
  charWidth: 6.6,
  labelPadX: 10,
};

export type PlacedNode = {
  id: number;
  name: string;
  rank: string;
  status: NodeStatus;
  expandable: boolean;
  depth: number;
  x: number;
  y: number;
  labelWidth: number;
  children: PlacedNode[];
};

export type CladogramEdge = {
  d: string;
};

export type CladogramLayout = {
  root: PlacedNode;
  nodes: PlacedNode[];
  edges: CladogramEdge[];
  width: number;
  height: number;
  leafCount: number;
  depth: number;
};

export function estimateLabelWidth(name: string, metrics: CladogramMetrics = DEFAULT_METRICS): number {
  return Math.ceil(name.length * metrics.charWidth + metrics.labelPadX);
}

export function countLeaves(node: TreeNodeView): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function treeDepth(node: TreeNodeView): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

/**
 * Pack remaining taxa as a left-to-right cladogram: each leaf takes one row,
 * parents sit on the midpoint of their descendant leaves. This replaces nested
 * flex alignment, which stretched parents to the height of huge child groups.
 */
export function layoutCladogram(
  tree: TreeNodeView,
  metrics: CladogramMetrics = DEFAULT_METRICS,
): CladogramLayout {
  const maxWidthAtDepth: number[] = [];

  const measure = (node: TreeNodeView, depth: number) => {
    const width = estimateLabelWidth(node.taxon.name, metrics);
    maxWidthAtDepth[depth] = Math.max(maxWidthAtDepth[depth] ?? 0, width);
    for (const child of node.children) measure(child, depth + 1);
  };
  measure(tree, 0);

  const colX: number[] = [0];
  for (let depth = 0; depth < maxWidthAtDepth.length; depth += 1) {
    colX[depth + 1] = (colX[depth] ?? 0) + (maxWidthAtDepth[depth] ?? 0) + metrics.rail;
  }

  let nextLeaf = 0;
  const place = (node: TreeNodeView, depth: number): PlacedNode => {
    const children = node.children.map((child) => place(child, depth + 1));
    const labelWidth = estimateLabelWidth(node.taxon.name, metrics);
    let y: number;
    if (children.length === 0) {
      y = nextLeaf * metrics.rowHeight + metrics.rowHeight / 2;
      nextLeaf += 1;
    } else {
      const first = children[0]!;
      const last = children[children.length - 1]!;
      y = (first.y + last.y) / 2;
    }
    return {
      id: node.taxon.id,
      name: node.taxon.name,
      rank: node.taxon.rank,
      status: node.status,
      expandable: node.expandable,
      depth,
      x: colX[depth] ?? 0,
      y,
      labelWidth,
      children,
    };
  };

  const root = place(tree, 0);
  const nodes: PlacedNode[] = [];
  const edges: CladogramEdge[] = [];
  let maxRight = 0;
  let maxDepth = 1;

  const walk = (node: PlacedNode) => {
    nodes.push(node);
    maxRight = Math.max(maxRight, node.x + node.labelWidth);
    maxDepth = Math.max(maxDepth, node.depth + 1);
    if (node.children.length === 0) return;

    const elbowX = (colX[node.depth + 1] ?? node.x + node.labelWidth + metrics.rail) - metrics.rail;
    const parentRight = node.x + node.labelWidth;
    const first = node.children[0]!;
    const last = node.children[node.children.length - 1]!;

    if (node.children.length === 1 && Math.abs(first.y - node.y) < 0.5) {
      edges.push({ d: `M ${parentRight} ${node.y} H ${first.x}` });
    } else {
      const parts = [`M ${parentRight} ${node.y} H ${elbowX}`];
      if (Math.abs(first.y - last.y) > 0.5) {
        parts.push(`M ${elbowX} ${first.y} V ${last.y}`);
      }
      for (const child of node.children) {
        parts.push(`M ${elbowX} ${child.y} H ${child.x}`);
      }
      edges.push({ d: parts.join(" ") });
    }

    for (const child of node.children) walk(child);
  };
  walk(root);

  return {
    root,
    nodes,
    edges,
    width: Math.ceil(maxRight + 4),
    height: Math.ceil(nextLeaf * metrics.rowHeight),
    leafCount: nextLeaf,
    depth: maxDepth,
  };
}

export function fitScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
  options?: { min?: number; max?: number; pad?: number },
): number {
  const pad = options?.pad ?? 0;
  const min = options?.min ?? 0.62;
  const max = options?.max ?? 1;
  const viewW = Math.max(1, viewWidth - pad);
  const viewH = Math.max(1, viewHeight - pad);
  if (contentWidth <= viewW && contentHeight <= viewH) return max;
  const raw = Math.min(viewW / Math.max(1, contentWidth), viewH / Math.max(1, contentHeight));
  return Math.min(max, Math.max(min, raw));
}
