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
  expandable: boolean;
  skipped?: number;
  overflow?: number;
};

/** Textbook Animalia crown and major clades shown as structure even without genera. */
const SCAFFOLD_TAXA = new Set([
  "Porifera",
  "Cnidaria",
  "Placozoa",
  "Ctenophora",
  "Eumetazoa",
  "Triploblastica",
  "Bilateria",
  "Eubilateria",
  "Protostomia",
  "Deuterostomia",
  "Ecdysozoa",
  "Spiralia",
  "Lophotrochozoa",
  "Panarthropoda",
  "Ambulacraria",
  "Arthropoda",
  "Mollusca",
  "Annelida",
  "Brachiopoda",
  "Bryozoa",
  "Echinodermata",
  "Hemichordata",
  "Chordata",
  "Dinosauria",
  "Trilobita",
  "Ammonoidea",
  "Mammalia",
  "Avialae",
]);

/** Unranked wrappers that should be open so major phyla are visible on load. */
const SCAFFOLD_EXPAND = new Set([
  "Animalia",
  "Eumetazoa",
  "Triploblastica",
  "Bilateria",
  "Eubilateria",
  "Protostomia",
  "Deuterostomia",
  "Ecdysozoa",
  "Spiralia",
  "Lophotrochozoa",
  "Panarthropoda",
  "Ambulacraria",
]);

const SPINE_NAMES = new Set([
  "Animalia",
  ...SCAFFOLD_TAXA,
]);

const SCAFFOLD_ORDER = [
  "Porifera",
  "Cnidaria",
  "Placozoa",
  "Ctenophora",
  "Eumetazoa",
  "Triploblastica",
  "Bilateria",
  "Eubilateria",
  "Protostomia",
  "Ecdysozoa",
  "Panarthropoda",
  "Arthropoda",
  "Spiralia",
  "Lophotrochozoa",
  "Mollusca",
  "Annelida",
  "Brachiopoda",
  "Bryozoa",
  "Deuterostomia",
  "Ambulacraria",
  "Echinodermata",
  "Hemichordata",
  "Chordata",
];

const MAX_CHILDREN = 16;

const CROWN_HIDE_RANKS = new Set([
  "genus",
  "subgenus",
  "family",
  "subfamily",
  "tribe",
  "subtribe",
  "superfamily",
]);

const DRILLED_PARENT_RANKS = new Set([
  "class",
  "subclass",
  "infraclass",
  "order",
  "suborder",
  "infraorder",
]);

export function isScaffoldTaxon(
  taxon: Taxon,
  fullCounts?: Map<number, number>,
): boolean {
  if (SCAFFOLD_TAXA.has(taxon.name)) return true;
  return taxon.rank === "phylum" && (fullCounts?.get(taxon.id) ?? 0) > 0;
}

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

export function allGenusCounts(taxonomy: TaxonomyIndex): Map<number, number> {
  return remainingGenusCounts(taxonomy, {
    constraintId: taxonomy.rootId,
    eliminated: [],
    steps: [],
  });
}

export function viewChildren(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  parentId: number,
  counts = remainingGenusCounts(taxonomy, state),
  fullCounts = allGenusCounts(taxonomy),
): TreeBranch[] {
  const kids = taxonomy.children.get(parentId) ?? [];
  const rows: TreeBranch[] = [];

  const parent = taxonomy.require(parentId);
  const parentDrilled = DRILLED_PARENT_RANKS.has(parent.rank);

  for (const taxon of kids) {
    const status = nodeStatus(taxonomy, taxon.id, state);
    const genusCount = counts.get(taxon.id) ?? 0;
    const scaffold = isScaffoldTaxon(taxon, fullCounts);
    const hideDeepLeaf =
      CROWN_HIDE_RANKS.has(taxon.rank) &&
      status !== "pruned" &&
      parentId !== state.constraintId &&
      !parentDrilled;
    if (hideDeepLeaf) continue;
    if (status === "pruned") {
      rows.push({ taxon, genusCount, status });
      continue;
    }
    if (status === "outside") {
      if ((fullCounts.get(taxon.id) ?? 0) > 0 || scaffold) {
        rows.push({ taxon, genusCount, status });
      }
      continue;
    }
    if (
      genusCount > 0 ||
      status === "lineage" ||
      status === "constraint" ||
      scaffold
    ) {
      rows.push({ taxon, genusCount, status });
    }
  }

  const rank = (row: TreeBranch) => {
    if (row.status === "constraint" || row.status === "lineage") return 0;
    if (row.status === "pruned") return 1;
    if (row.status === "remaining") return 2;
    return 3;
  };

  const orderOf = (name: string) => {
    const index = SCAFFOLD_ORDER.indexOf(name);
    return index === -1 ? 1000 : index;
  };

  return rows.sort((a, b) => {
    const genusPenalty = (row: TreeBranch) => (row.taxon.rank === "genus" ? 1 : 0);
    return (
      rank(a) - rank(b) ||
      orderOf(a.taxon.name) - orderOf(b.taxon.name) ||
      genusPenalty(a) - genusPenalty(b) ||
      b.genusCount - a.genusCount ||
      a.taxon.name.localeCompare(b.taxon.name)
    );
  });
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
  const keep = spineKeepIds(taxonomy, state);
  const expanded = new Set<number>(keep);

  const counts = remainingGenusCounts(taxonomy, state);
  const fullCounts = allGenusCounts(taxonomy);
  const constraintDepth = taxonomy.pathToRoot(state.constraintId).length;

  if (constraintDepth <= 8) {
    for (const taxon of taxonomy.byId.values()) {
      if (!SCAFFOLD_EXPAND.has(taxon.name)) continue;
      const status = nodeStatus(taxonomy, taxon.id, state);
      if (status === "remaining" || status === "lineage" || status === "constraint") {
        expanded.add(taxon.id);
      }
    }
  }

  let cursor = state.constraintId;
  let extraLevels = constraintDepth > 1 && constraintDepth <= 6 ? 1 : 0;

  for (let depth = 0; depth < 10; depth += 1) {
    const kids = viewChildren(taxonomy, state, cursor, counts, fullCounts).filter(
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
      for (const kid of kids.filter((row) => row.taxon.rank !== "genus").slice(0, 6)) {
        expanded.add(kid.taxon.id);
      }
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
  const fullCounts = allGenusCounts(taxonomy);
  const keep = new Set(spineKeepIds(taxonomy, state));
  for (const id of expanded) {
    const status = nodeStatus(taxonomy, id, state);
    if (status !== "lineage") keep.add(id);
  }

  const walk = (id: number): TreeNodeView => {
    const taxon = taxonomy.require(id);
    const status = nodeStatus(taxonomy, id, state);
    const kids = viewChildren(taxonomy, state, id, counts, fullCounts);
    const node: TreeNodeView = {
      taxon,
      status,
      genusCount: counts.get(id) ?? 0,
      children: [],
      expandable:
        status !== "pruned" &&
        status !== "outside" &&
        kids.length > 0,
    };

    if (status === "pruned" || status === "outside") return node;
    if (!expanded.has(id) && id !== state.constraintId) return node;
    const rendered: TreeNodeView[] = [];

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

    const pruned = rendered.filter((child) => child.status === "pruned");
    const rest = rendered.filter((child) => child.status !== "pruned");
    if (rendered.length > MAX_CHILDREN) {
      const room = Math.max(MAX_CHILDREN - pruned.length, 0);
      node.overflow = rest.length - room;
      node.children = [...pruned, ...rest.slice(0, room)];
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
