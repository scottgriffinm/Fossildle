import { cluster, hierarchy, type HierarchyNode, type HierarchyPointNode } from "d3-hierarchy";
import { linkHorizontal } from "d3-shape";
import type { NodeStatus, TreeNodeView } from "./tree-view";

export type CladogramMetrics = {
  rowHeight: number;
  charWidth: number;
  labelPadX: number;
  linkGap: number;
  nodeRadius: number;
  padX: number;
  padY: number;
};

/** Tight leaf packing; columns sized from label estimates. */
export const DEFAULT_METRICS: CladogramMetrics = {
  rowHeight: 17,
  charWidth: 6.6,
  labelPadX: 10,
  linkGap: 22,
  nodeRadius: 2.4,
  padX: 6,
  padY: 8,
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

export type CladogramLink = {
  parentId: number;
  childId: number;
  source: [number, number];
  target: [number, number];
  d: string;
};

export type CladogramLayout = {
  root: PlacedNode;
  nodes: PlacedNode[];
  links: CladogramLink[];
  width: number;
  height: number;
  leafCount: number;
  depth: number;
  engine: "d3-cluster-linkHorizontal";
};

type CladeDatum = {
  id: number;
  name: string;
  rank: string;
  status: NodeStatus;
  expandable: boolean;
  children?: CladeDatum[];
};

function toDatum(node: TreeNodeView): CladeDatum {
  return {
    id: node.taxon.id,
    name: node.taxon.name,
    rank: node.taxon.rank,
    status: node.status,
    expandable: node.expandable,
    children: node.children.length > 0 ? node.children.map(toDatum) : undefined,
  };
}

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

const horizontalLink = linkHorizontal<
  { source: [number, number]; target: [number, number] },
  [number, number]
>();

/** Parent→child cubic (curveBumpX) from d3-shape's linkHorizontal. */
export function cladogramLink(source: [number, number], target: [number, number]): string {
  return horizontalLink({ source, target }) ?? "";
}

function columnWidths(
  root: HierarchyNode<CladeDatum>,
  metrics: CladogramMetrics,
): number[] {
  const height = Math.max(root.height, 1);
  const cols = Array.from({ length: height }, () => metrics.linkGap);
  root.each((node) => {
    if (!node.children || node.depth >= height) return;
    const needed = estimateLabelWidth(node.data.name, metrics) + metrics.linkGap;
    cols[node.depth] = Math.max(cols[node.depth]!, needed);
  });
  return cols;
}

function cumulative(cols: number[], padX: number): number[] {
  const xs = [padX];
  for (const col of cols) xs.push(xs[xs.length - 1]! + col);
  return xs;
}

/**
 * Classic left-to-right cladogram via open-source D3:
 * d3-hierarchy cluster (equal leaf spacing, parents on midpoints)
 * + d3-shape linkHorizontal (one real parent→child curve per edge).
 */
export function layoutCladogram(
  tree: TreeNodeView,
  metrics: CladogramMetrics = DEFAULT_METRICS,
): CladogramLayout {
  const root = hierarchy(toDatum(tree));
  const leafCount = Math.max(root.leaves().length, 1);
  const cols = columnWidths(root, metrics);
  const xAt = cumulative(cols, metrics.padX);

  const laid = cluster<CladeDatum>()
    .nodeSize([metrics.rowHeight, 1])
    .separation(() => 1)(root);

  let minY = Infinity;
  let maxY = -Infinity;
  laid.each((node) => {
    minY = Math.min(minY, node.x);
    maxY = Math.max(maxY, node.x);
  });
  if (!Number.isFinite(minY)) {
    minY = 0;
    maxY = 0;
  }

  const placedById = new Map<number, PlacedNode>();
  const nodes: PlacedNode[] = [];
  let maxRight = metrics.padX;

  const screenOf = (node: HierarchyPointNode<CladeDatum>): { x: number; y: number; labelWidth: number } => {
    const labelWidth = estimateLabelWidth(node.data.name, metrics);
    const x = xAt[node.depth] ?? metrics.padX;
    const y = node.x - minY + metrics.padY + metrics.rowHeight / 2;
    return { x, y, labelWidth };
  };

  laid.each((node) => {
    const { x, y, labelWidth } = screenOf(node);
    const placed: PlacedNode = {
      id: node.data.id,
      name: node.data.name,
      rank: node.data.rank,
      status: node.data.status,
      expandable: node.data.expandable,
      depth: node.depth,
      x,
      y,
      labelWidth,
      children: [],
    };
    placedById.set(placed.id, placed);
    nodes.push(placed);
    maxRight = Math.max(maxRight, x + labelWidth + metrics.nodeRadius);
  });

  laid.each((node) => {
    const parent = placedById.get(node.data.id);
    if (!parent || !node.children) return;
    parent.children = node.children.map((child) => placedById.get(child.data.id)!);
  });

  const links: CladogramLink[] = [];
  laid.each((node) => {
    if (!node.parent) return;
    const parent = placedById.get(node.parent.data.id)!;
    const child = placedById.get(node.data.id)!;
    const source: [number, number] = [
      parent.x + parent.labelWidth + metrics.nodeRadius,
      parent.y,
    ];
    const target: [number, number] = [child.x, child.y];
    links.push({
      parentId: parent.id,
      childId: child.id,
      source,
      target,
      d: cladogramLink(source, target),
    });
  });

  const placedRoot = placedById.get(laid.data.id)!;
  const height = Math.ceil(maxY - minY + metrics.rowHeight + metrics.padY * 2);

  return {
    root: placedRoot,
    nodes,
    links,
    width: Math.ceil(maxRight + metrics.padX),
    height,
    leafCount,
    depth: root.height + 1,
    engine: "d3-cluster-linkHorizontal",
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
