import { cluster, hierarchy, type HierarchyNode, type HierarchyPointNode } from "d3-hierarchy";
import { curveStepBefore, line } from "d3-shape";
import type { NodeStatus, TreeNodeView } from "./tree-view";

export type CladogramMetrics = {
  rowHeight: number;
  charWidth: number;
  fontSize: number;
  labelPadX: number;
  labelInset: number;
  labelLift: number;
  tipGap: number;
  branchPad: number;
  branchMin: number;
  stemMin: number;
  padX: number;
  padY: number;
};

/**
 * Packed LTR crown. Internals sit above the incoming run; tips hang off the
 * line end — phylotree.js rectangular + textbook cladogram.
 */
export const DEFAULT_METRICS: CladogramMetrics = {
  rowHeight: 22,
  charWidth: 6.6,
  fontSize: 11,
  labelPadX: 4,
  labelInset: 5,
  labelLift: 8,
  tipGap: 3,
  branchPad: 10,
  branchMin: 40,
  stemMin: 44,
  padX: 8,
  padY: 18,
};

export type PlacedNode = {
  id: number;
  name: string;
  rank: string;
  status: NodeStatus;
  expandable: boolean;
  depth: number;
  /** Right end of the incoming branch; vertical spine for children. */
  x: number;
  /** Horizontal branch / elbow y. */
  y: number;
  /** Left end of the incoming horizontal (parent.x, or root stem start). */
  incomingX: number;
  /** Left edge of the name. */
  labelX: number;
  /** Text baseline. Internals sit above the stroke; tips sit on the tip. */
  labelY: number;
  labelWidth: number;
  isTip: boolean;
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
  /** Root stem so the constraint sits on a branch, not a floating point. */
  stem: CladogramLink;
  width: number;
  height: number;
  leafCount: number;
  depth: number;
  engine: "phylotree-curveStepBefore";
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

/**
 * veg/phylotree.js `src/render/cartesian.js`:
 * `d3.line().curve(d3.curveStepBefore)` — vertical at the parent, then a
 * continuous horizontal into the child. Joins are node coordinates; labels
 * are never part of the path.
 */
const stepLink = line<[number, number]>()
  .x((point) => point[0])
  .y((point) => point[1])
  .curve(curveStepBefore);

export function cladogramLink(source: [number, number], target: [number, number]): string {
  return stepLink([source, target]) ?? "";
}

/** Incoming run must fit internal names that sit on that branch. */
function columnWidths(root: HierarchyNode<CladeDatum>, metrics: CladogramMetrics): number[] {
  const height = Math.max(root.height, 1);
  const cols = Array.from({ length: height }, () => metrics.branchMin);
  root.each((node) => {
    const isTip = !node.children?.length;
    if (node.depth === 0 || isTip) return;
    const needed =
      metrics.labelInset + estimateLabelWidth(node.data.name, metrics) + metrics.branchPad;
    cols[node.depth - 1] = Math.max(cols[node.depth - 1]!, needed);
  });
  return cols;
}

function rootStemWidth(root: HierarchyNode<CladeDatum>, metrics: CladogramMetrics): number {
  const isTip = !root.children?.length;
  if (isTip) return metrics.stemMin;
  return Math.max(
    metrics.stemMin,
    metrics.labelInset + estimateLabelWidth(root.data.name, metrics) + metrics.branchPad,
  );
}

function cumulative(stem: number, cols: number[], padX: number): number[] {
  const xs = [padX + stem];
  for (const col of cols) xs.push(xs[xs.length - 1]! + col);
  return xs;
}

function placeLabel(
  node: { x: number; y: number; incomingX: number; name: string; isTip: boolean },
  metrics: CladogramMetrics,
): { labelX: number; labelY: number; labelWidth: number } {
  const labelWidth = estimateLabelWidth(node.name, metrics);
  if (node.isTip) {
    return {
      labelX: node.x + metrics.tipGap,
      labelY: node.y + metrics.fontSize * 0.32,
      labelWidth,
    };
  }
  // Left-aligned at the start of the incoming run so the stroke stays
  // visible after the name all the way to the join (textbook / phylotree).
  return {
    labelX: node.incomingX + metrics.labelInset,
    labelY: node.y - metrics.labelLift,
    labelWidth,
  };
}

/**
 * Left-to-right rectangular cladogram:
 * - d3-hierarchy cluster (equal leaf spacing, parents on midpoints)
 * - phylotree.js curveStepBefore elbows from parent join → child join
 * - internal names above the incoming horizontal; tip names flush right of the tip
 */
export function layoutCladogram(
  tree: TreeNodeView,
  metrics: CladogramMetrics = DEFAULT_METRICS,
): CladogramLayout {
  const root = hierarchy(toDatum(tree));
  const leafCount = Math.max(root.leaves().length, 1);
  const stem = rootStemWidth(root, metrics);
  const cols = columnWidths(root, metrics);
  const xAt = cumulative(stem, cols, metrics.padX);

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

  const screenOf = (node: HierarchyPointNode<CladeDatum>): { x: number; y: number } => {
    const x = xAt[node.depth] ?? metrics.padX + stem;
    const y = node.x - minY + metrics.padY;
    return { x, y };
  };

  laid.each((node) => {
    const { x, y } = screenOf(node);
    const incomingX = node.parent ? screenOf(node.parent).x : metrics.padX;
    const isTip = !node.children?.length;
    const label = placeLabel({ x, y, incomingX, name: node.data.name, isTip }, metrics);
    const placed: PlacedNode = {
      id: node.data.id,
      name: node.data.name,
      rank: node.data.rank,
      status: node.data.status,
      expandable: node.data.expandable,
      depth: node.depth,
      x,
      y,
      incomingX,
      labelX: label.labelX,
      labelY: label.labelY,
      labelWidth: label.labelWidth,
      isTip,
      children: [],
    };
    placedById.set(placed.id, placed);
    nodes.push(placed);
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
    const source: [number, number] = [parent.x, parent.y];
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
  const stemSource: [number, number] = [placedRoot.incomingX, placedRoot.y];
  const stemTarget: [number, number] = [placedRoot.x, placedRoot.y];
  const stemLink: CladogramLink = {
    parentId: placedRoot.id,
    childId: placedRoot.id,
    source: stemSource,
    target: stemTarget,
    d: cladogramLink(stemSource, stemTarget),
  };

  let maxRight = placedRoot.x;
  for (const node of nodes) {
    maxRight = Math.max(maxRight, node.isTip ? node.labelX + node.labelWidth : node.x);
  }

  const height = Math.ceil(maxY - minY + metrics.padY * 2);
  const width = Math.ceil(maxRight + metrics.padX);

  return {
    root: placedRoot,
    nodes,
    links,
    stem: stemLink,
    width,
    height,
    leafCount,
    depth: root.height + 1,
    engine: "phylotree-curveStepBefore",
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

/** Names never sit in a hole in the path. */
export function labelIsAttached(
  node: PlacedNode,
  metrics: CladogramMetrics = DEFAULT_METRICS,
): boolean {
  if (node.isTip) {
    return node.labelX >= node.x && node.labelX <= node.x + metrics.tipGap + 1;
  }
  return (
    node.labelY <= node.y - metrics.labelLift + 0.01 &&
    node.labelX >= node.incomingX - 0.01 &&
    node.labelX + node.labelWidth <= node.x + metrics.branchPad + 0.01
  );
}
