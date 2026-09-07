export type Taxon = {
  id: number;
  name: string;
  rank: string;
  parentId: number | null;
};

export type TaxonAlias = {
  name: string;
  id: number;
};

export type TaxonomyData = {
  version: number;
  rootId: number;
  source?: string;
  generatedAt?: string;
  taxa: Taxon[];
  aliases: TaxonAlias[];
};

export type FossilRecord = {
  id: string;
  taxon: string;
  commonName?: string;
  pbdb_oid: string;
  phylum: string;
  commons_file: string;
  image_url: string;
  license: string;
  attribution: string;
  imageSrc: string;
  taxonId: number;
};

export type SearchHit = {
  taxon: Taxon;
  matchedName: string;
  via: "scientific" | "common" | "alias";
};

export type PruneStep = {
  guessId: number;
  mrcaId: number;
  prunedId: number | null;
};

export type PruneState = {
  constraintId: number;
  eliminated: number[];
  steps: PruneStep[];
};

export type GuessResolution =
  | { ok: true; taxon: Taxon; viaAlias: string | null }
  | { ok: false; reason: "empty" | "unknown" | "not-genus" | "not-remaining" | "duplicate" };

export type GameStatus = "playing" | "won" | "lost";
