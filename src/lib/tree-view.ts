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
};

/** Textbook Animalia crown and major clades shown as structure even without genera. */
const SCAFFOLD_TAXA = new Set([
  "Porifera",
  "Cnidaria",
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

/** Named spine clades that stay expanded so the crown is a real tree. */
const SCAFFOLD_EXPAND = new Set([
  "Animalia",
  "Bilateria",
  "Eubilateria",
  "Protostomia",
  "Deuterostomia",
]);

/** Unranked wrappers skipped so phyla hang on the named spine (textbook crown). */
const CROWN_WRAPPERS = new Set([
  "Eumetazoa",
  "Triploblastica",
  "Ecdysozoa",
  "Spiralia",
  "Lophotrochozoa",
  "Panarthropoda",
  "Ambulacraria",
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

const CROWN_HIDE_RANKS = new Set([
  "genus",
  "subgenus",
  "family",
  "subfamily",
  "tribe",
  "subtribe",
  "superfamily",
]);

/** Show genera only when a parent has a small remaining set. */
const SMALL_REMAINING = 16;

const VISIBLE_STATUSES = new Set<NodeStatus>(["lineage", "constraint", "remaining"]);

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

function flattenCrownWrappers(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  rows: TreeBranch[],
  counts: Map<number, number>,
  fullCounts: Map<number, number>,
): TreeBranch[] {
  const out: TreeBranch[] = [];
  for (const row of rows) {
    if (
      CROWN_WRAPPERS.has(row.taxon.name) &&
      VISIBLE_STATUSES.has(row.status) &&
      row.taxon.id !== state.constraintId
    ) {
      const nested = viewChildren(taxonomy, state, row.taxon.id, counts, fullCounts);
      out.push(...flattenCrownWrappers(taxonomy, state, nested, counts, fullCounts));
      continue;
    }
    out.push(row);
  }
  return out;
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
  const constraintRemaining = counts.get(state.constraintId) ?? 0;

  for (const taxon of kids) {
    const status = nodeStatus(taxonomy, taxon.id, state);
    if (!VISIBLE_STATUSES.has(status)) continue;

    const genusCount = counts.get(taxon.id) ?? 0;
    const hideDeepLeaf =
      CROWN_HIDE_RANKS.has(taxon.rank) && constraintRemaining > SMALL_REMAINING;
    if (hideDeepLeaf) continue;

    if (
      genusCount > 0 ||
      status === "lineage" ||
      status === "constraint" ||
      isScaffoldTaxon(taxon, fullCounts)
    ) {
      rows.push({ taxon, genusCount, status });
    }
  }

  const rank = (row: TreeBranch) => {
    if (row.status === "constraint" || row.status === "lineage") return 0;
    return 1;
  };

  const orderOf = (name: string) => {
    const index = SCAFFOLD_ORDER.indexOf(name);
    return index === -1 ? 1000 : index;
  };

  const flattened = flattenCrownWrappers(taxonomy, state, rows, counts, fullCounts);
  return flattened.sort((a, b) => {
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

function shouldExpand(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  taxon: Taxon,
  splitDepth: number,
): boolean {
  if (taxon.rank === "genus") return false;
  if (taxon.id === state.constraintId) return true;
  if (SCAFFOLD_EXPAND.has(taxon.name)) return true;
  if (state.constraintId === taxonomy.rootId) return false;
  if (CROWN_HIDE_RANKS.has(taxon.rank) || taxon.rank === "phylum") return false;
  return splitDepth < 2;
}

function walkRemaining(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  id: number,
  counts: Map<number, number>,
  fullCounts: Map<number, number>,
  splitDepth: number,
): TreeNodeView {
  const taxon = taxonomy.require(id);
  const status = nodeStatus(taxonomy, id, state);
  const node: TreeNodeView = {
    taxon,
    status,
    genusCount: counts.get(id) ?? 0,
    children: [],
  };

  if (!VISIBLE_STATUSES.has(status)) return node;
  if (!shouldExpand(taxonomy, state, taxon, splitDepth)) return node;

  const kids = viewChildren(taxonomy, state, id, counts, fullCounts);
  const nextDepth = kids.length <= 1 ? splitDepth : splitDepth + 1;
  node.children = kids.map((kid) =>
    walkRemaining(taxonomy, state, kid.taxon.id, counts, fullCounts, nextDepth),
  );
  return node;
}

function nestPath(nodes: TreeNodeView[]): TreeNodeView {
  const root = nodes[0]!;
  let cursor = root;
  for (const next of nodes.slice(1)) {
    cursor.children = [next];
    cursor = next;
  }
  return root;
}

const REVEAL_RANKS = new Set([
  "kingdom",
  "phylum",
  "subphylum",
  "class",
  "subclass",
  "order",
  "suborder",
  "superfamily",
  "family",
  "subfamily",
  "genus",
]);

const REVEAL_NAMES = new Set([
  "Animalia",
  "Bilateria",
  "Eubilateria",
  "Protostomia",
  "Deuterostomia",
  "Dinosauria",
  "Trilobita",
  "Ammonoidea",
  "Mammalia",
  "Avialae",
]);

function revealLineage(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  answerId: number,
): Taxon[] {
  const full = taxonomy
    .pathToRoot(answerId)
    .map((id) => taxonomy.require(id))
    .reverse();
  const start = full.findIndex((taxon) => taxon.id === state.constraintId);
  const slice =
    start >= 0
      ? full.slice(start)
      : full.filter(
          (taxon) =>
            taxon.id === state.constraintId ||
            taxonomy.isAncestor(state.constraintId, taxon.id),
        );
  const parentId = taxonomy.require(answerId).parentId;

  return slice.filter((taxon, index) => {
    if (index === 0 || taxon.id === answerId) return true;
    if (CROWN_WRAPPERS.has(taxon.name) && taxon.id !== state.constraintId) return false;
    if (taxon.id === parentId) return true;
    if (REVEAL_RANKS.has(taxon.rank)) return true;
    return REVEAL_NAMES.has(taxon.name);
  });
}

function buildRevealPath(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  answerId: number,
): TreeNodeView {
  const counts = remainingGenusCounts(taxonomy, state);
  const path = revealLineage(taxonomy, state, answerId);

  const nodes: TreeNodeView[] = path.map((taxon) => {
    const status: NodeStatus =
      taxon.id === answerId
        ? "remaining"
        : taxon.id === state.constraintId
          ? "constraint"
          : "lineage";
    return {
      taxon,
      status,
      genusCount: counts.get(taxon.id) ?? 0,
      children: [],
    };
  });

  return nestPath(nodes);
}

export function buildCabinetTree(
  taxonomy: TaxonomyIndex,
  state: PruneState,
  options?: { revealId?: number },
): TreeNodeView {
  if (options?.revealId != null) {
    return buildRevealPath(taxonomy, state, options.revealId);
  }

  const counts = remainingGenusCounts(taxonomy, state);
  const fullCounts = allGenusCounts(taxonomy);
  return walkRemaining(taxonomy, state, state.constraintId, counts, fullCounts, 0);
}
