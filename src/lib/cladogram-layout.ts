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
  branchPad: number;
  branchMin: number;
  stemMin: number;
  padX: number;
  padY: number;
};

/**
 * Tight leaf packing. Horizontal run at each depth is sized to the child
 * name that sits on that incoming branch (phylotree / textbook cladogram).
 */
export const DEFAULT_METRICS: CladogramMetrics = {
  rowHeight: 18,
  charWidth: 6.5,
  fontSize: 11,
  labelPadX: 6,
  labelInset: 6,
  labelLift: 3.2,
  branchPad: 10,
  branchMin: 28,
  stemMin: 36,
  padX: 8,
  padY: 16,
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
  /** Left edge of the name, on the incoming branch. */
  labelX: number;
  /** Text baseline, above the branch. */
  labelY: number;
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
  /** Root stem so Animalia sits on a branch, not a floating point. */
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
 * continuous horizontal into the child. Node coordinates are the joins;
 * labels never break the path.
 */
const stepLink = line<[number, number]>()
  .x((point) => point[0])
  .y((point) => point[1])
  .curve(curveStepBefore);

export function cladogramLink(source: [number, number], target: [number, number]): string {
  return stepLink([source, target]) ?? "";
}

/** Space from parent.x → child.x must fit the child's name on that run. */
function columnWidths(root: HierarchyNode<CladeDatum>, metrics: CladogramMetrics): number[] {
  const height = Math.max(root.height, 1);
  const cols = Array.from({ length: height }, () => metrics.branchMin);
  root.each((node) => {
    if (node.depth === 0) return;
    const needed =
      metrics.labelInset + estimateLabelWidth(node.data.name, metrics) + metrics.branchPad;
    cols[node.depth - 1] = Math.max(cols[node.depth - 1]!, needed);
  });
  return cols;
}

function rootStemWidth(root: HierarchyNode<CladeDatum>, metrics: CladogramMetrics): number {
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

/**
 * Left-to-right rectangular cladogram:
 * - d3-hierarchy cluster (equal leaf spacing, parents on midpoints)
 * - phylotree.js curveStepBefore elbows from parent join → child join
 * - taxon names sit above the incoming horizontal (textbook + Scott)
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
    const labelWidth = estimateLabelWidth(node.data.name, metrics);
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
      labelX: incomingX + metrics.labelInset,
      labelY: y - metrics.labelLift,
      labelWidth,
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

  const height = Math.ceil(maxY - minY + metrics.padY * 2);
  const width = Math.ceil((xAt[xAt.length - 1] ?? placedRoot.x) + metrics.padX);

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

/** True when the child's name sits on the incoming horizontal, not in a gap. */
export function labelSitsOnIncomingBranch(
  node: PlacedNode,
  metrics: CladogramMetrics = DEFAULT_METRICS,
): boolean {
  const left = node.incomingX;
  const right = node.x;
  const nameLeft = node.labelX;
  const nameRight = node.labelX + node.labelWidth;
  return (
    node.labelY < node.y &&
    nameLeft >= left - 0.01 &&
    nameRight <= right + metrics.branchPad + 0.01 &&
    right - left >= node.labelWidth
  );
}
