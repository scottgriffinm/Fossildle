import { sharedDepthId } from "./rank-path";
import type { TaxonomyIndex } from "./taxonomy";
import type { GameStatus, PruneState } from "./types";

export type TreePaint = "green" | "red" | "neutral";

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

/** Root plus its shallow children — the opening mounted set. */
export function openingExpandedIds(taxonomy: TaxonomyIndex): number[] {
  return [taxonomy.rootId];
}

/**
 * Nodes the outline currently mounts: every expanded taxon and its
 * direct children. Collapsed subtrees stay unloaded.
 */
export function mountedTaxonIds(
  taxonomy: TaxonomyIndex,
  expandedIds: Iterable<number>,
): number[] {
  const expanded = new Set(expandedIds);
  const mounted: number[] = [];
  const walk = (id: number) => {
    mounted.push(id);
    if (!expanded.has(id)) return;
    for (const child of taxonomy.children.get(id) ?? []) {
      walk(child.id);
    }
  };
  walk(taxonomy.rootId);
  return mounted;
}

/** After a guess, open the confirmed shared path so green nodes are visible. */
export function sharedPathExpandIds(
  taxonomy: TaxonomyIndex,
  answerId: number,
  prune: PruneState,
): number[] {
  const sharedId = sharedDepthId(taxonomy, answerId, prune);
  if (sharedId == null) return openingExpandedIds(taxonomy);
  return taxonomy.pathToRoot(sharedId);
}
