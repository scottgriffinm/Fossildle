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
  rail: 10,
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
  kind: "stem" | "spine" | "twig";
};

/** Horizontal run from the right edge of a parent label to the child elbow. */
export function parentStemX(parentRight: number, metrics: CladogramMetrics = DEFAULT_METRICS): number {
  return parentRight + metrics.rail;
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
  let nextLeaf = 0;
  const place = (node: TreeNodeView, depth: number, x: number): PlacedNode => {
    const labelWidth = estimateLabelWidth(node.taxon.name, metrics);
    const childX = x + labelWidth + metrics.rail;
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
      children,
    };
  };

  const root = place(tree, 0, 0);
  const nodes: PlacedNode[] = [];
  const edges: CladogramEdge[] = [];
  let maxRight = 0;
  let maxDepth = 1;

  const walk = (node: PlacedNode) => {
    nodes.push(node);
    maxRight = Math.max(maxRight, node.x + node.labelWidth);
    maxDepth = Math.max(maxDepth, node.depth + 1);
    if (node.children.length === 0) return;

    const parentRight = node.x + node.labelWidth;
    const elbowX = parentStemX(parentRight, metrics);
    const first = node.children[0]!;
    const last = node.children[node.children.length - 1]!;

    // Separate path elements: compound H/V subpaths drop segments on some
    // mobile WebKit compositors after a CSS scale transform.
    if (node.children.length === 1 && Math.abs(first.y - node.y) < 0.5) {
      edges.push({
        kind: "stem",
        d: `M ${fmt(parentRight)} ${fmt(node.y)} L ${fmt(first.x)} ${fmt(first.y)}`,
      });
    } else {
      edges.push({
        kind: "stem",
        d: `M ${fmt(parentRight)} ${fmt(node.y)} L ${fmt(elbowX)} ${fmt(node.y)}`,
      });
      if (Math.abs(first.y - last.y) > 0.5) {
        edges.push({
          kind: "spine",
          d: `M ${fmt(elbowX)} ${fmt(first.y)} L ${fmt(elbowX)} ${fmt(last.y)}`,
        });
      }
      for (const child of node.children) {
        edges.push({
          kind: "twig",
          d: `M ${fmt(elbowX)} ${fmt(child.y)} L ${fmt(child.x)} ${fmt(child.y)}`,
        });
      }
    }

    for (const child of node.children) walk(child);
  };
  walk(root);

  return {
    root,
    nodes,
    edges,
    width: Math.ceil(maxRight + metrics.rail),
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
