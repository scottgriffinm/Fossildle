import type { TaxonomyIndex } from "./taxonomy";
import type { PruneState, Taxon } from "./types";

export type NodeStatus = "lineage" | "constraint" | "remaining" | "pruned" | "outside";

export type TreeBranch = {
  taxon: Taxon;
  genusCount: number;
  status: NodeStatus;
};

export type TreeNodeView = {
  taxon: Taxon;
  status: NodeStatus;
  genusCount: number;
  children: TreeNodeView[];
  skipped?: number;
  overflow?: number;
};

const SPINE_NAMES = new Set([
  "Animalia",
  "Bilateria",
  "Eubilateria",
  "Protostomia",
  "Deuterostomia",
  "Ecdysozoa",
  "Spiralia",
  "Chordata",
  "Arthropoda",
  "Mollusca",
  "Dinosauria",
  "Trilobita",
  "Ammonoidea",
  "Mammalia",
  "Avialae",
  "Cnidaria",
]);

const MAX_CHILDREN = 16;

export function remainingGenusCounts(
  taxonomy: TaxonomyIndex,
  state: PruneState,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const genus of taxonomy.remainingGenera(state)) {
    for (const id of taxonomy.pathToRoot(genus.id)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export function nodeStatus(
  taxonomy: TaxonomyIndex,
  id: number,
  state: PruneState,
): NodeStatus {
  if (state.eliminated.some((elim) => id === elim || taxonomy.isAncestor(elim, id))) {
    return "pruned";
  }
  if (id === state.constraintId) return "constraint";
  if (taxonomy.isAncestor(id, state.constraintId)) return "lineage";
  if (taxonomy.isRemaining(id, state)) return "remaining";
  return "outside";
}

export function viewChildren(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  parentId: number,
  counts = remainingGenusCounts(taxonomy, state),
): TreeBranch[] {
  const kids = taxonomy.children.get(parentId) ?? [];
  const rows: TreeBranch[] = [];

  for (const taxon of kids) {
    const status = nodeStatus(taxonomy, taxon.id, state);
    const genusCount = counts.get(taxon.id) ?? 0;
    if (status === "pruned") {
      rows.push({ taxon, genusCount, status });
      continue;
    }
    if (status === "outside") {
      const hadAnyChild = (taxonomy.children.get(taxon.id) ?? []).length > 0;
      if (hadAnyChild || taxon.rank === "phylum" || taxon.rank === "class") {
        rows.push({ taxon, genusCount, status });
      }
      continue;
    }
    if (genusCount > 0 || status === "lineage" || status === "constraint") {
      rows.push({ taxon, genusCount, status });
    }
  }

  const rank = (row: TreeBranch) => {
    if (row.status === "constraint" || row.status === "lineage") return 0;
    if (row.status === "remaining") return 1;
    if (row.status === "pruned") return 2;
    return 3;
  };

  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.genusCount - a.genusCount ||
      a.taxon.name.localeCompare(b.taxon.name),
  );
}

export function spineKeepIds(taxonomy: TaxonomyIndex, state: PruneState): Set<number> {
  const keep = new Set<number>([taxonomy.rootId, state.constraintId]);
  for (const step of state.steps) {
    keep.add(step.mrcaId);
    if (step.prunedId != null) {
      keep.add(step.prunedId);
      const parent = taxonomy.require(step.prunedId).parentId;
      if (parent != null) keep.add(parent);
    }
  }
  for (const id of taxonomy.pathToRoot(state.constraintId)) {
    const taxon = taxonomy.require(id);
    if (SPINE_NAMES.has(taxon.name) || taxon.rank === "phylum") keep.add(id);
  }
  return keep;
}

export function autoExpandIds(taxonomy: TaxonomyIndex, state: PruneState): number[] {
  const expanded = new Set<number>();
  for (const id of taxonomy.pathToRoot(state.constraintId)) {
    expanded.add(id);
  }

  const counts = remainingGenusCounts(taxonomy, state);
  let cursor = state.constraintId;
  let extraLevels = 1;

  for (let depth = 0; depth < 10; depth += 1) {
    const kids = viewChildren(taxonomy, state, cursor, counts).filter(
      (row) => row.status === "remaining" || row.status === "lineage" || row.status === "constraint",
    );
    if (kids.length === 0) break;
    expanded.add(cursor);

    if (kids.length === 1) {
      cursor = kids[0]!.taxon.id;
      continue;
    }

    const total = kids.reduce((sum, row) => sum + row.genusCount, 0);
    const top = kids[0]!;
    const dominant = total > 0 && top.genusCount / total >= 0.85;
    const unranked = top.taxon.rank === "unranked" || top.taxon.rank === "informal";
    if (dominant && unranked) {
      cursor = top.taxon.id;
      continue;
    }

    if (extraLevels > 0) {
      extraLevels -= 1;
      for (const kid of kids) expanded.add(kid.taxon.id);
    }
    break;
  }

  expanded.add(cursor);
  return [...expanded];
}

export function buildCabinetTree(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  expandedIds: Iterable<number>,
): TreeNodeView {
  const expanded = new Set(expandedIds);
  const counts = remainingGenusCounts(taxonomy, state);
  const keep = spineKeepIds(taxonomy, state);
  for (const id of expanded) keep.add(id);

  const walk = (id: number): TreeNodeView => {
    const taxon = taxonomy.require(id);
    const status = nodeStatus(taxonomy, id, state);
    const node: TreeNodeView = {
      taxon,
      status,
      genusCount: counts.get(id) ?? 0,
      children: [],
    };

    if (status === "pruned" || status === "outside") return node;
    if (!expanded.has(id) && id !== state.constraintId) return node;

    const kids = viewChildren(taxonomy, state, id, counts);
    const rendered: TreeNodeView[] = [];
    let skipped = 0;

    for (const kid of kids) {
      if (
        kid.status === "lineage" &&
        !keep.has(kid.taxon.id) &&
        kid.taxon.id !== state.constraintId
      ) {
        const nextShown = nextKeptDescendant(taxonomy, state, kid.taxon.id, keep);
        if (nextShown != null) {
          const collapsed = walk(nextShown);
          const gap = taxonomy.pathToRoot(nextShown).indexOf(kid.taxon.id);
          collapsed.skipped = (collapsed.skipped ?? 0) + Math.max(gap, 1);
          rendered.push(collapsed);
        }
        continue;
      }
      rendered.push(walk(kid.taxon.id));
    }

    if (rendered.length > MAX_CHILDREN) {
      node.overflow = rendered.length - MAX_CHILDREN;
      node.children = rendered.slice(0, MAX_CHILDREN);
    } else {
      node.children = rendered;
    }
    return node;
  };

  return walk(taxonomy.rootId);
}

function nextKeptDescendant(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  startId: number,
  keep: Set<number>,
): number | null {
  const path = taxonomy.pathToRoot(state.constraintId);
  const startIndex = path.indexOf(startId);
  if (startIndex <= 0) return keep.has(startId) ? startId : null;
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const id = path[i]!;
    if (keep.has(id) || id === state.constraintId) return id;
  }
  return state.constraintId;
}
