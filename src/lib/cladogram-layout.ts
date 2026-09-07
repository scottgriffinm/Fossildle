import type { NodeStatus, TreeNodeView } from "./tree-view";

export type CladogramMetrics = {
  rowHeight: number;
  /** Incoming stub so the root name sits on a branch, not a floating label. */
  rootStem: number;
  /** Horizontal run from the right of a parent name to the sibling bar. */
  stem: number;
  /** Horizontal run from the sibling bar to the child name. */
  twig: number;
  charWidth: number;
  labelPadX: number;
};

/**
 * Packed leaf rows, but connectors are a textbook LTR cladogram:
 * name sits on the branch, a short stem leaves the right of the name,
 * a vertical bar gathers siblings, then a real twig reaches each child.
 * A 10px rail with zero-length twigs reads as file-tree ticks — do not
 * collapse stem+twig into a single gap that ends at the child x.
 */
export const DEFAULT_METRICS: CladogramMetrics = {
  rowHeight: 16,
  rootStem: 8,
  stem: 8,
  twig: 18,
  charWidth: 6.05,
  labelPadX: 4,
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
  /** Right edge of the glyph run — outgoing connectors start here, not at the box. */
  inkRight: number;
  children: PlacedNode[];
};

export type CladogramEdge = {
  d: string;
  kind: "branch";
};

/** Sibling-bar x: just to the right of the parent name, not beside the children. */
export function parentElbowX(
  parentInkRight: number,
  metrics: CladogramMetrics = DEFAULT_METRICS,
): number {
  return parentInkRight + metrics.stem;
}

export function childOriginX(
  parentInkRight: number,
  metrics: CladogramMetrics = DEFAULT_METRICS,
): number {
  return parentInkRight + metrics.stem + metrics.twig;
}

export type CladogramLayout = {
  root: PlacedNode;
  nodes: PlacedNode[];
  edges: CladogramEdge[];
  width: number;
  height: number;
  leafCount: number;
  depth: number;
};

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

function branchPath(parent: PlacedNode, child: PlacedNode, elbowX: number): string {
  const x0 = parent.inkRight;
  const y0 = parent.y;
  const x1 = child.x;
  const y1 = child.y;
  if (Math.abs(y1 - y0) < 0.5) {
    return `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)}`;
  }
  return `M ${fmt(x0)} ${fmt(y0)} L ${fmt(elbowX)} ${fmt(y0)} L ${fmt(elbowX)} ${fmt(y1)} L ${fmt(x1)} ${fmt(y1)}`;
}

/**
 * Pack remaining taxa as a left-to-right cladogram: each leaf takes one row,
 * parents sit on the midpoint of their descendant leaves. Connectors are
 * continuous parent→child L-paths so the crown reads as branches, not a rail.
 */
export function layoutCladogram(
  tree: TreeNodeView,
  metrics: CladogramMetrics = DEFAULT_METRICS,
  inkWidths?: ReadonlyMap<number, number>,
): CladogramLayout {
  let nextLeaf = 0;
  const place = (node: TreeNodeView, depth: number, x: number): PlacedNode => {
    const textWidth = inkWidths?.get(node.taxon.id) ?? estimateTextWidth(node.taxon.name, metrics);
    const labelWidth = textWidth + metrics.labelPadX;
    const inkRight = x + textWidth;
    const childX = childOriginX(inkRight, metrics);
    const children = node.children.map((child) => place(child, depth + 1, childX));
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
      x,
      y,
      labelWidth,
      inkRight,
      children,
    };
  };

  const root = place(tree, 0, metrics.rootStem);
  const nodes: PlacedNode[] = [];
  const edges: CladogramEdge[] = [];
  let maxRight = 0;
  let maxDepth = 1;

  if (metrics.rootStem > 0) {
    edges.push({
      kind: "branch",
      d: `M ${fmt(0)} ${fmt(root.y)} L ${fmt(root.x)} ${fmt(root.y)}`,
    });
  }

  const walk = (node: PlacedNode) => {
    nodes.push(node);
    maxRight = Math.max(maxRight, node.x + node.labelWidth);
    maxDepth = Math.max(maxDepth, node.depth + 1);
    if (node.inkRight - node.x > 0.5) {
      edges.push({
        kind: "branch",
        d: `M ${fmt(node.x)} ${fmt(node.y)} L ${fmt(node.inkRight)} ${fmt(node.y)}`,
      });
    }
    if (node.children.length === 0) return;

    const elbowX = parentElbowX(node.inkRight, metrics);
    for (const child of node.children) {
      edges.push({
        kind: "branch",
        d: branchPath(node, child, elbowX),
      });
    }

    for (const child of node.children) walk(child);
  };
  walk(root);

  return {
    root,
    nodes,
    edges,
    width: Math.ceil(maxRight + metrics.twig * 0.25),
    height: Math.ceil(nextLeaf * metrics.rowHeight),
    leafCount: nextLeaf,
    depth: maxDepth,
  };
}

function fmt(value: number): string {
  return value.toFixed(2);
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
