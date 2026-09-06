import type {
  GuessResolution,
  PruneState,
  Taxon,
  TaxonomyData,
} from "./types";

const MAJOR_RANKS = new Set([
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

export class TaxonomyIndex {
  readonly rootId: number;
  readonly byId: Map<number, Taxon>;
  readonly children: Map<number, Taxon[]>;
  readonly genera: Taxon[];
  private readonly byName: Map<string, Taxon[]>;
  private readonly aliasToId: Map<string, number>;
  private readonly pathCache = new Map<number, number[]>();

  constructor(data: TaxonomyData) {
    this.rootId = data.rootId;
    this.byId = new Map(data.taxa.map((taxon) => [taxon.id, taxon]));
    this.children = new Map();
    this.byName = new Map();

    for (const taxon of data.taxa) {
      if (taxon.parentId != null) {
        const siblings = this.children.get(taxon.parentId);
        if (siblings) siblings.push(taxon);
        else this.children.set(taxon.parentId, [taxon]);
      }
      const key = normalizeName(taxon.name);
      const bucket = this.byName.get(key);
      if (bucket) bucket.push(taxon);
      else this.byName.set(key, [taxon]);
    }

    for (const kids of this.children.values()) {
      kids.sort((a, b) => a.name.localeCompare(b.name));
    }

    this.genera = data.taxa.filter((taxon) => taxon.rank === "genus");
    this.aliasToId = new Map();
    for (const alias of data.aliases) {
      this.aliasToId.set(normalizeName(alias.name), alias.id);
    }
  }

  get(id: number): Taxon | undefined {
    return this.byId.get(id);
  }

  require(id: number): Taxon {
    const taxon = this.byId.get(id);
    if (!taxon) throw new Error(`Unknown taxon id ${id}`);
    return taxon;
  }

  /** [id, parent, ..., root] */
  pathToRoot(id: number): number[] {
    const cached = this.pathCache.get(id);
    if (cached) return cached;

    const path: number[] = [];
    const seen = new Set<number>();
    let cursor: Taxon | undefined = this.byId.get(id);
    while (cursor && !seen.has(cursor.id)) {
      path.push(cursor.id);
      seen.add(cursor.id);
      cursor = cursor.parentId == null ? undefined : this.byId.get(cursor.parentId);
    }
    this.pathCache.set(id, path);
    return path;
  }

  mrca(a: number, b: number): number {
    const pathA = this.pathToRoot(a);
    const ancestors = new Set(pathA);
    for (const id of this.pathToRoot(b)) {
      if (ancestors.has(id)) return id;
    }
    return this.rootId;
  }

  /** Child of `ancestor` that lies on the path to `descendant`. */
  childToward(ancestor: number, descendant: number): number | null {
    if (ancestor === descendant) return null;
    const path = this.pathToRoot(descendant);
    const index = path.indexOf(ancestor);
    if (index === -1) return null;
    if (index === 0) return null;
    return path[index - 1] ?? null;
  }

  distance(a: number, b: number): number {
    const mrca = this.mrca(a, b);
    return (
      this.pathToRoot(a).indexOf(mrca) + this.pathToRoot(b).indexOf(mrca)
    );
  }

  isAncestor(ancestor: number, descendant: number): boolean {
    return ancestor === descendant || this.pathToRoot(descendant).includes(ancestor);
  }

  pruneRemaining(answerId: number, guesses: number[]): PruneState {
    const state: PruneState = {
      constraintId: this.rootId,
      eliminated: [],
      steps: [],
    };

    for (const guessId of guesses) {
      if (guessId === answerId) {
        state.steps.push({
          guessId,
          mrcaId: answerId,
          prunedId: null,
        });
        continue;
      }
      const mrcaId = this.mrca(guessId, answerId);
      const prunedId = this.childToward(mrcaId, guessId);
      state.constraintId = mrcaId;
      if (prunedId != null && !state.eliminated.includes(prunedId)) {
        state.eliminated.push(prunedId);
      }
      state.steps.push({ guessId, mrcaId, prunedId });
    }

    return state;
  }

  isRemaining(id: number, state: PruneState): boolean {
    if (id !== state.constraintId && !this.isAncestor(state.constraintId, id)) {
      return false;
    }
    for (const eliminated of state.eliminated) {
      if (id === eliminated || this.isAncestor(eliminated, id)) return false;
    }
    return true;
  }

  remainingGenera(state: PruneState): Taxon[] {
    return this.genera.filter((taxon) => this.isRemaining(taxon.id, state));
  }

  remainingBranches(
    state: PruneState,
    parentId = state.constraintId,
  ): { taxon: Taxon; genusCount: number }[] {
    const kids = this.children.get(parentId) ?? [];
    const counts = new Map<number, number>();
    for (const genus of this.genera) {
      if (!this.isRemaining(genus.id, state)) continue;
      const path = this.pathToRoot(genus.id);
      const parentIndex = path.indexOf(parentId);
      if (parentIndex <= 0) continue;
      const childId = path[parentIndex - 1];
      if (childId == null) continue;
      counts.set(childId, (counts.get(childId) ?? 0) + 1);
    }

    return kids
      .filter((kid) => this.isRemaining(kid.id, state) && (counts.get(kid.id) ?? 0) > 0)
      .map((taxon) => ({ taxon, genusCount: counts.get(taxon.id) ?? 0 }))
      .sort((a, b) => b.genusCount - a.genusCount || a.taxon.name.localeCompare(b.taxon.name));
  }

  /**
   * Branches to show in the cabinet: the shallowest major rank that still
   * splits remaining genera (phylum → class → order → family → genus).
   * This keeps the opening view wide (Chordata / Arthropoda / Mollusca)
   * instead of a single unranked child like Bilateria.
   */
  informativeBranches(
    state: PruneState,
    viewRoot = state.constraintId,
  ): { taxon: Taxon; genusCount: number }[] {
    const ranks = ["phylum", "class", "order", "family", "genus"] as const;
    const remaining = this.remainingGenera(state).filter((genus) =>
      this.isAncestor(viewRoot, genus.id),
    );

    for (const rank of ranks) {
      const groups = new Map<number, number>();
      for (const genus of remaining) {
        const path = this.pathToRoot(genus.id);
        const rootIndex = path.indexOf(viewRoot);
        const slice = rootIndex === -1 ? path : path.slice(0, rootIndex);
        const nodeId = slice.find((id) => this.require(id).rank === rank);
        if (nodeId == null) continue;
        groups.set(nodeId, (groups.get(nodeId) ?? 0) + 1);
      }
      if (groups.size >= 2) {
        return [...groups.entries()]
          .map(([id, genusCount]) => ({ taxon: this.require(id), genusCount }))
          .sort(
            (a, b) =>
              b.genusCount - a.genusCount || a.taxon.name.localeCompare(b.taxon.name),
          );
      }
    }

    return this.remainingBranches(state, viewRoot);
  }

  displayPath(id: number): Taxon[] {
    const full = this.pathToRoot(id)
      .map((nodeId) => this.require(nodeId))
      .reverse();
    return full.filter((taxon, index) => {
      if (index === 0 || index === full.length - 1) return true;
      if (MAJOR_RANKS.has(taxon.rank)) return true;
      return [
        "Dinosauria",
        "Trilobita",
        "Ammonoidea",
        "Mammalia",
        "Avialae",
        "Bilateria",
        "Eubilateria",
        "Protostomia",
        "Deuterostomia",
      ].includes(taxon.name);
    });
  }

  resolveGuess(
    raw: string,
    state: PruneState,
    alreadyGuessed: number[],
  ): GuessResolution {
    const query = normalizeName(raw);
    if (!query) return { ok: false, reason: "empty" };

    const aliasId = this.aliasToId.get(query);
    const named = this.byName.get(query) ?? [];
    const exactGenus = named.find((taxon) => taxon.rank === "genus");
    const targetId = aliasId ?? exactGenus?.id ?? named[0]?.id;

    if (targetId == null) return { ok: false, reason: "unknown" };

    const taxon = this.require(targetId);
    if (taxon.rank !== "genus") {
      return { ok: false, reason: "not-genus" };
    }
    if (alreadyGuessed.includes(taxon.id)) {
      return { ok: false, reason: "duplicate" };
    }
    if (!this.isRemaining(taxon.id, state)) {
      return { ok: false, reason: "not-remaining" };
    }

    return {
      ok: true,
      taxon,
      viaAlias: aliasId && normalizeName(taxon.name) !== query ? raw.trim() : null,
    };
  }

  searchGenera(raw: string, state: PruneState, limit = 8): Taxon[] {
    const query = normalizeName(raw);
    if (query.length < 1) return [];

    const hits: { taxon: Taxon; score: number }[] = [];
    const seen = new Set<number>();

    const consider = (taxon: Taxon, label: string) => {
      if (seen.has(taxon.id) || taxon.rank !== "genus") return;
      if (!this.isRemaining(taxon.id, state)) return;
      const name = normalizeName(label);
      if (!name.includes(query) && !name.startsWith(query)) return;
      seen.add(taxon.id);
      const score = scoreMatch(name, query);
      hits.push({ taxon, score });
    };

    for (const genus of this.genera) consider(genus, genus.name);
    for (const [alias, id] of this.aliasToId) {
      const taxon = this.byId.get(id);
      if (taxon) consider(taxon, alias);
    }

    hits.sort(
      (a, b) =>
        a.score - b.score ||
        a.taxon.name.length - b.taxon.name.length ||
        a.taxon.name.localeCompare(b.taxon.name),
    );
    return hits.slice(0, limit).map((hit) => hit.taxon);
  }
}

export function normalizeName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function scoreMatch(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const idx = name.indexOf(query);
  return idx >= 0 ? 2 + idx / 100 : 50;
}

export function parsePbdbOid(oid: string): number {
  const match = oid.match(/(\d+)\s*$/);
  if (!match) throw new Error(`Invalid PBDB oid: ${oid}`);
  return Number(match[1]);
}
