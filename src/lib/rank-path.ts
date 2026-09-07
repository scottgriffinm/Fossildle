import type { TaxonomyIndex } from "./taxonomy";
import type { GameStatus, PruneState, Taxon } from "./types";

/** Linnaean ranks that stay on the play chain. Deeper duplicate ranks
 *  (Osteichthyes vs Reptilia) keep only the taxon closest to the answer. */
export const PLAY_RANKS = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
] as const;

/** Real clades that matter for play even when PBDB leaves them unranked. */
export const PLAY_CLADES = new Set([
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

export type PathSegmentState = "green" | "unknown" | "revealed";

export type RankSegment = {
  taxon: Taxon;
  rankLabel: string;
  state: PathSegmentState;
};

export function rankLabel(taxon: Taxon): string {
  if (taxon.rank === "unranked" || taxon.rank === "informal") return "clade";
  return taxon.rank;
}

/** Readable Animalia → genus chain using real taxa from the answer path. */
export function playRankPath(taxonomy: TaxonomyIndex, answerId: number): Taxon[] {
  const full = taxonomy
    .pathToRoot(answerId)
    .map((id) => taxonomy.require(id))
    .reverse();

  const deepestByRank = new Map<string, Taxon>();
  for (const taxon of full) {
    if ((PLAY_RANKS as readonly string[]).includes(taxon.rank)) {
      deepestByRank.set(taxon.rank, taxon);
    }
  }

  const keep = new Set<number>([full[0]!.id, answerId]);
  for (const taxon of deepestByRank.values()) keep.add(taxon.id);
  for (const taxon of full) {
    if (PLAY_CLADES.has(taxon.name)) keep.add(taxon.id);
  }

  return full.filter((taxon) => keep.has(taxon.id));
}

/**
 * Deepest shared taxon that should light green: the remaining prune
 * constraint, or the answer itself after a hit.
 */
export function sharedDepthId(
  taxonomy: TaxonomyIndex,
  answerId: number,
  prune: PruneState,
): number {
  const last = prune.steps.at(-1);
  if (!last) return taxonomy.rootId;
  if (last.guessId === answerId) return answerId;
  return prune.constraintId;
}

function isOnSharedPath(
  taxonomy: TaxonomyIndex,
  taxonId: number,
  sharedId: number,
): boolean {
  return taxonId === sharedId || taxonomy.isAncestor(taxonId, sharedId);
}

/** Put the current MRCA on the chain when it is a real taxon not already shown. */
export function withConstraint(
  taxonomy: TaxonomyIndex,
  path: Taxon[],
  constraintId: number,
): Taxon[] {
  if (path.some((taxon) => taxon.id === constraintId)) return path;
  const constraint = taxonomy.require(constraintId);
  const insertAfter = path.findLastIndex(
    (taxon) => taxon.id === constraintId || taxonomy.isAncestor(taxon.id, constraintId),
  );
  if (insertAfter === -1) return [constraint, ...path];
  return [...path.slice(0, insertAfter + 1), constraint, ...path.slice(insertAfter + 1)];
}

export function colorRankPath(
  taxonomy: TaxonomyIndex,
  answerId: number,
  prune: PruneState,
  status: GameStatus = "playing",
): RankSegment[] {
  const sharedId = sharedDepthId(taxonomy, answerId, prune);
  const path = withConstraint(taxonomy, playRankPath(taxonomy, answerId), sharedId);
  const revealRest = status === "lost";

  return path.map((taxon) => {
    const green = isOnSharedPath(taxonomy, taxon.id, sharedId);
    const state: PathSegmentState = green ? "green" : revealRest ? "revealed" : "unknown";
    return {
      taxon,
      rankLabel: rankLabel(taxon),
      state,
    };
  });
}
