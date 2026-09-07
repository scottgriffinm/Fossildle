import { cluster, hierarchy, type HierarchyNode, type HierarchyPointNode } from "d3-hierarchy";
import type { NodeStatus, TreeNodeView } from "./tree-view";

export type CladogramMetrics = {
  rowHeight: number;
  charWidth: number;
  labelPadX: number;
  /** Horizontal run from the right of a parent name to the sibling bar. */
  stem: number;
  /** Horizontal run from the sibling bar to the child joint. */
  twig: number;
  nodeRadius: number;
  labelOffset: number;
  padX: number;
  padY: number;
};

/**
 * d3-hierarchy cluster packs leaves; connectors are textbook orthogonal
 * elbows. Cubic linkHorizontal on this crown is only ~20px wide and reads
 * as a vertical S-spine — the same tick-mark look Scott rejected on #19.
 */
export const DEFAULT_METRICS: CladogramMetrics = {
  rowHeight: 17,
  charWidth: 6.1,
  labelPadX: 4,
  stem: 8,
  twig: 22,
  nodeRadius: 2.2,
  labelOffset: 5,
  padX: 8,
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
  /** Right edge of the glyph run — outgoing elbows start here. */
  inkRight: number;
  children: PlacedNode[];
};

export type CladogramLink = {
  parentId: number;
  childId: number;
  source: [number, number];
  target: [number, number];
  elbowX: number;
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
  engine: "d3-cluster-elbow";
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

export function estimateTextWidth(name: string, metrics: CladogramMetrics = DEFAULT_METRICS): number {
  return Math.ceil(name.length * metrics.charWidth);
}

export function estimateLabelWidth(name: string, metrics: CladogramMetrics = DEFAULT_METRICS): number {
  return estimateTextWidth(name, metrics) + metrics.labelPadX;
}

export function countLeaves(node: TreeNodeView): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function treeDepth(node: TreeNodeView): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

function fmt(value: number): string {
  return value.toFixed(2);
}

/** Orthogonal parent→child cladogram elbow (H then V then H). */
export function cladogramElbow(
  source: [number, number],
  target: [number, number],
  stem: number = DEFAULT_METRICS.stem,
): string {
  const [x0, y0] = source;
  const [x1, y1] = target;
  if (Math.abs(y1 - y0) < 0.5) {
    return `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)}`;
  }
  const elbowX = x0 + stem;
  return `M ${fmt(x0)} ${fmt(y0)} L ${fmt(elbowX)} ${fmt(y0)} L ${fmt(elbowX)} ${fmt(y1)} L ${fmt(x1)} ${fmt(y1)}`;
}

function columnWidths(
  root: HierarchyNode<CladeDatum>,
  metrics: CladogramMetrics,
  inkWidths?: ReadonlyMap<number, number>,
): number[] {
  const height = Math.max(root.height, 1);
  const branch = metrics.stem + metrics.twig;
  const cols = Array.from({ length: height }, () => branch);
  root.each((node) => {
    if (!node.children || node.depth >= height) return;
    const text = inkWidths?.get(node.data.id) ?? estimateTextWidth(node.data.name, metrics);
    const needed = metrics.labelOffset + text + branch;
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
 * Classic left-to-right cladogram: d3-hierarchy cluster for leaf packing,
 * orthogonal elbows so each name sits on a branch that continues right
 * into a sibling bar and a real twig to each child.
 */
export function layoutCladogram(
  tree: TreeNodeView,
  metrics: CladogramMetrics = DEFAULT_METRICS,
  inkWidths?: ReadonlyMap<number, number>,
): CladogramLayout {
  const root = hierarchy(toDatum(tree));
  const leafCount = Math.max(root.leaves().length, 1);
  const cols = columnWidths(root, metrics, inkWidths);
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

  const screenOf = (node: HierarchyPointNode<CladeDatum>) => {
    const textWidth = inkWidths?.get(node.data.id) ?? estimateTextWidth(node.data.name, metrics);
    const labelWidth = textWidth + metrics.labelPadX;
    const x = xAt[node.depth] ?? metrics.padX;
    const y = node.x - minY + metrics.padY + metrics.rowHeight / 2;
    const inkRight = x + metrics.labelOffset + textWidth;
    return { x, y, labelWidth, inkRight };
  };

  laid.each((node) => {
    const { x, y, labelWidth, inkRight } = screenOf(node);
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
      inkRight,
      children: [],
    };
    placedById.set(placed.id, placed);
    nodes.push(placed);
    maxRight = Math.max(maxRight, inkRight + metrics.twig * 0.25);
  });

  laid.each((node) => {
    const parent = placedById.get(node.data.id);
    if (!parent || !node.children) return;
    parent.children = node.children.map((child) => placedById.get(child.data.id)!);
  });

  const links: CladogramLink[] = [];
  for (const placed of nodes) {
    if (placed.inkRight - placed.x > 0.5) {
      links.push({
        parentId: placed.id,
        childId: placed.id,
        source: [placed.x, placed.y],
        target: [placed.inkRight, placed.y],
        elbowX: placed.inkRight,
        d: `M ${fmt(placed.x)} ${fmt(placed.y)} L ${fmt(placed.inkRight)} ${fmt(placed.y)}`,
      });
    }
  }
  laid.each((node) => {
    if (!node.parent) return;
    const parent = placedById.get(node.parent.data.id)!;
    const child = placedById.get(node.data.id)!;
    const source: [number, number] = [parent.inkRight, parent.y];
    const target: [number, number] = [child.x, child.y];
    const elbowX = parent.inkRight + metrics.stem;
    links.push({
      parentId: parent.id,
      childId: child.id,
      source,
      target,
      elbowX,
      d: cladogramElbow(source, target, metrics.stem),
    });
  });

  const placedRoot = placedById.get(laid.data.id)!;
  if (metrics.padX > 0) {
    links.push({
      parentId: placedRoot.id,
      childId: placedRoot.id,
      source: [0, placedRoot.y],
      target: [placedRoot.x, placedRoot.y],
      elbowX: placedRoot.x,
      d: `M ${fmt(0)} ${fmt(placedRoot.y)} L ${fmt(placedRoot.x)} ${fmt(placedRoot.y)}`,
    });
  }

  const height = Math.ceil(maxY - minY + metrics.rowHeight + metrics.padY * 2);

  return {
    root: placedRoot,
    nodes,
    links,
    width: Math.ceil(maxRight + metrics.padX),
    height,
    leafCount,
    depth: root.height + 1,
    engine: "d3-cluster-elbow",
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
