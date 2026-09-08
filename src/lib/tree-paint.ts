import { playRankPath, sharedDepthId } from "./rank-path";
import type { TaxonomyIndex } from "./taxonomy";
import type { GameStatus, PruneState, Taxon } from "./types";

export type TreePaint = "green" | "red" | "neutral";

/** Remaining sibling forks stay visible when they still hold this many genera. */
const MIN_FORK_GENERA = 8;
/** If the frontier already has this few remaining forks, show all of them. */
const SMALL_FORK_CAP = 4;
/** Hard cap on remaining frontier siblings (plus the toward-answer child). */
const MAX_REMAINING_FORKS = 5;

/**
 * Green = confirmed shared path (Animalia → current constraint / hit).
 * Red = ruled out by guesses (outside the remaining set).
 * Neutral = still possible, or unrevealed before the first guess.
 *
 * Animalia stays neutral until a guess locks a shared depth.
 */
export function paintTaxon(
  taxonomy: TaxonomyIndex,
  taxonId: number,
  answerId: number,
  prune: PruneState,
  status: GameStatus = "playing",
): TreePaint {
  const sharedId = sharedDepthId(taxonomy, answerId, prune);
  if (sharedId != null && (taxonId === sharedId || taxonomy.isAncestor(taxonId, sharedId))) {
    return "green";
  }
  if (status === "lost" && taxonId === answerId) {
    return "neutral";
  }
  if (!taxonomy.isRemaining(taxonId, prune)) {
    return "red";
  }
  return "neutral";
}

/**
 * Taxa in the path-neighborhood: compressed ancestors on the confirmed
 * (or revealed) path, exclusive branches guesses have painted red, and
 * the still-ambiguous sibling forks at the current frontier.
 *
 * Before the first guess this is Animalia alone — not the full crown of
 * shallow Animalia children.
 */
export function pathNeighborhoodIds(
  taxonomy: TaxonomyIndex,
  answerId: number,
  prune: PruneState,
  status: GameStatus = "playing",
): number[] {
  const ids = new Set<number>([taxonomy.rootId]);
  const sharedId = sharedDepthId(taxonomy, answerId, prune);

  if (sharedId == null && status === "playing") {
    return [taxonomy.rootId];
  }

  const targetId = sharedId ?? answerId;
  const keep = new Set<number>([taxonomy.rootId, targetId]);

  for (const taxon of playRankPath(taxonomy, answerId)) {
    if (taxon.id === targetId || taxonomy.isAncestor(taxon.id, targetId)) {
      keep.add(taxon.id);
    }
  }

  if (status === "lost" || status === "won" || sharedId === answerId) {
    for (const taxon of playRankPath(taxonomy, answerId)) {
      keep.add(taxon.id);
    }
    keep.add(answerId);
  }

  for (const eliminatedId of prune.eliminated) {
    keep.add(eliminatedId);
    const parentId = taxonomy.require(eliminatedId).parentId;
    if (parentId == null) continue;
    if (parentId === targetId || taxonomy.isAncestor(parentId, targetId)) {
      keep.add(parentId);
    }
  }

  const toward = taxonomy.childToward(targetId, answerId);
  if (toward != null) keep.add(toward);

  for (const child of frontierRemainingForks(taxonomy, targetId, answerId, prune)) {
    keep.add(child.id);
  }

  for (const id of keep) ids.add(id);
  return [...ids];
}

/**
 * Direct children of `parentId` that belong in the neighborhood view,
 * nearest-ancestor compressed so skipped stem wrappers drop out.
 */
export function neighborhoodChildren(
  taxonomy: TaxonomyIndex,
  parentId: number,
  neighborhoodIds: Iterable<number>,
  answerId: number,
  prune: PruneState,
  status: GameStatus = "playing",
): Taxon[] {
  const hood = neighborhoodIds instanceof Set ? neighborhoodIds : new Set(neighborhoodIds);
  const kids: Taxon[] = [];
  for (const id of hood) {
    if (id === parentId) continue;
    if (nearestNeighborhoodAncestor(taxonomy, id, hood) === parentId) {
      kids.push(taxonomy.require(id));
    }
  }

  const paintRank = { green: 0, neutral: 1, red: 2 } as const;
  kids.sort((a, b) => {
    const aOnPath = a.id === answerId || taxonomy.isAncestor(a.id, answerId);
    const bOnPath = b.id === answerId || taxonomy.isAncestor(b.id, answerId);
    if (aOnPath !== bOnPath) return aOnPath ? -1 : 1;
    const aPaint = paintTaxon(taxonomy, a.id, answerId, prune, status);
    const bPaint = paintTaxon(taxonomy, b.id, answerId, prune, status);
    if (paintRank[aPaint] !== paintRank[bPaint]) {
      return paintRank[aPaint] - paintRank[bPaint];
    }
    return a.name.localeCompare(b.name);
  });
  return kids;
}

/** Expand every neighborhood node that still has a child in the view. */
export function neighborhoodExpandIds(
  taxonomy: TaxonomyIndex,
  answerId: number,
  prune: PruneState,
  status: GameStatus = "playing",
): number[] {
  const hood = new Set(pathNeighborhoodIds(taxonomy, answerId, prune, status));
  const expanded: number[] = [];
  for (const id of hood) {
    if (neighborhoodChildren(taxonomy, id, hood, answerId, prune, status).length > 0) {
      expanded.push(id);
    }
  }
  return expanded;
}

/**
 * Nodes the neighborhood currently mounts: every expanded taxon and its
 * neighborhood children. Collapsed subtrees stay unloaded.
 */
export function mountedTaxonIds(
  taxonomy: TaxonomyIndex,
  expandedIds: Iterable<number>,
  neighborhoodIds: Iterable<number>,
  answerId: number,
  prune: PruneState,
  status: GameStatus = "playing",
): number[] {
  const expanded = new Set(expandedIds);
  const hood = neighborhoodIds instanceof Set ? neighborhoodIds : new Set(neighborhoodIds);
  const mounted: number[] = [];
  const walk = (id: number) => {
    mounted.push(id);
    if (!expanded.has(id)) return;
    for (const child of neighborhoodChildren(taxonomy, id, hood, answerId, prune, status)) {
      walk(child.id);
    }
  };
  if (hood.has(taxonomy.rootId)) walk(taxonomy.rootId);
  return mounted;
}

function nearestNeighborhoodAncestor(
  taxonomy: TaxonomyIndex,
  taxonId: number,
  hood: Set<number>,
): number | null {
  for (const ancestorId of taxonomy.pathToRoot(taxonId).slice(1)) {
    if (hood.has(ancestorId)) return ancestorId;
  }
  return null;
}

function remainingGenusCount(
  taxonomy: TaxonomyIndex,
  taxonId: number,
  prune: PruneState,
): number {
  let count = 0;
  for (const genus of taxonomy.remainingGenera(prune)) {
    if (genus.id === taxonId || taxonomy.isAncestor(taxonId, genus.id)) count += 1;
  }
  return count;
}

function frontierRemainingForks(
  taxonomy: TaxonomyIndex,
  parentId: number,
  answerId: number,
  prune: PruneState,
): Taxon[] {
  const kids = taxonomy.children.get(parentId) ?? [];
  const remaining: { taxon: Taxon; genusCount: number }[] = [];
  for (const kid of kids) {
    if (!taxonomy.isRemaining(kid.id, prune)) continue;
    const genusCount = remainingGenusCount(taxonomy, kid.id, prune);
    if (genusCount <= 0) continue;
    remaining.push({ taxon: kid, genusCount });
  }

  remaining.sort(
    (a, b) => b.genusCount - a.genusCount || a.taxon.name.localeCompare(b.taxon.name),
  );

  const toward = taxonomy.childToward(parentId, answerId);
  const keep = new Set<number>();
  if (toward != null && taxonomy.isRemaining(toward, prune)) keep.add(toward);

  if (remaining.length <= SMALL_FORK_CAP) {
    for (const row of remaining) keep.add(row.taxon.id);
  } else {
    for (const row of remaining) {
      if (row.genusCount >= MIN_FORK_GENERA) keep.add(row.taxon.id);
    }
  }

  const ranked = remaining.filter((row) => keep.has(row.taxon.id)).slice(0, MAX_REMAINING_FORKS);
  if (toward != null && !ranked.some((row) => row.taxon.id === toward)) {
    const towardTaxon = kids.find((kid) => kid.id === toward);
    if (towardTaxon && taxonomy.isRemaining(toward, prune)) {
      ranked.unshift({ taxon: towardTaxon, genusCount: remainingGenusCount(taxonomy, toward, prune) });
    }
  }

  return ranked.map((row) => row.taxon);
}
