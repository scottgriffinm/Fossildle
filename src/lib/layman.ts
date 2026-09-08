import { primaryCommonName } from "./names";
import type { Taxon } from "./types";

/**
 * Everyday English for familiar Animalia groups. Keys are lowercase
 * scientific names. Values must be a real vernacular — never a Latin echo
 * ("bilaterians") and never a rank gloss ("a clade").
 */
export const CURATED_LAYMAN: Record<string, string> = {
  animalia: "animals",
  porifera: "sponges",
  cnidaria: "jellyfish and corals",
  ctenophora: "comb jellies",
  nematoda: "roundworms",
  nemata: "roundworms",
  nemertea: "ribbon worms",
  nemertini: "ribbon worms",
  platyhelminthes: "flatworms",
  onychophora: "velvet worms",
  priapulida: "priapulid worms",
  sipuncula: "peanut worms",
  sipunculida: "peanut worms",
  chaetognatha: "arrow worms",
  kinorhyncha: "mud dragons",
  phoronida: "horseshoe worms",
  acanthocephala: "thorny-headed worms",
  tardigrada: "water bears",
  brachiopoda: "lamp shells",
  mammalia: "mammals",
  reptilia: "reptiles",
  aves: "birds",
  avialae: "birds and kin",
  amphibia: "amphibians",
  osteichthyes: "bony fishes",
  chondrichthyes: "cartilaginous fishes",
  actinopterygii: "ray-finned fishes",
  sarcopterygii: "lobe-finned fishes",
  gnathostomata: "jawed vertebrates",
  vertebrata: "vertebrates",
  arthropoda: "arthropods",
  euarthropoda: "arthropods",
  mollusca: "molluscs",
  insecta: "insects",
  arachnida: "spiders and kin",
  trilobita: "trilobites",
  xiphosura: "horseshoe crabs",
  pycnogonida: "sea spiders",
  polyplacophora: "chitons",
  scaphopoda: "tusk shells",
  anthozoa: "corals and anemones",
  scyphozoa: "jellyfish",
  cubozoa: "box jellyfish",
  asteroidea: "starfish",
  ophiuroidea: "brittle stars",
  echinoidea: "sea urchins",
  holothuroidea: "sea cucumbers",
  dinosauria: "dinosaurs",
  thyreophora: "armored dinosaurs",
  ammonoidea: "ammonites",
  pterosauria: "pterosaurs",
  ichthyosauria: "ichthyosaurs",
  plesiosauria: "plesiosaurs",
  proboscidea: "elephants and kin",
  rodentia: "rodents",
  primates: "primates",
  cetacea: "whales and dolphins",
  artiodactyla: "even-toed ungulates",
  perissodactyla: "odd-toed ungulates",
  crocodylia: "crocodilians",
  squamata: "lizards and snakes",
  testudines: "turtles",
};

const RANK_GLOSS = /^(a|an)\s+(clade|kingdom|phylum|subphylum|superclass|class|subclass|infraclass|cohort|superorder|order|suborder|infraorder|superfamily|family|subfamily|tribe|genus)$/i;

/**
 * Household words we still show even when they share a stem with the
 * scientific name (Mammalia → mammals). Echoes like Bilateria →
 * bilaterians are not in this set.
 */
const HOUSEHOLD_VERNAMACS = new Set([
  "animals",
  "mammals",
  "reptiles",
  "birds",
  "amphibians",
  "insects",
  "dinosaurs",
  "trilobites",
  "ammonites",
  "vertebrates",
  "arthropods",
  "molluscs",
  "pterosaurs",
  "ichthyosaurs",
  "plesiosaurs",
  "rodents",
  "primates",
  "hyoliths",
]);

function foldLetters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function stripScientificTail(name: string): string {
  return name.replace(/(iformes|oidea|idae|inae|aceae|ales|ia|ea|ata|a)$/u, "");
}

function stripEnglishTail(name: string): string {
  return name.replace(/(ians|ans|ates|oids|ides|ids|ines|es|s)$/u, "");
}

/**
 * True when the subtitle just restates the Latin (Bilateria → bilaterians)
 * or names the rank (a clade, a class). Multi-word vernaculars and
 * household words pass.
 */
export function isRedundantVernacular(scientific: string, vernacular: string): boolean {
  const raw = vernacular.trim().toLowerCase();
  if (!raw) return true;
  if (RANK_GLOSS.test(raw)) return true;

  const sci = foldLetters(scientific);
  const ver = foldLetters(vernacular);
  if (!sci || !ver) return true;
  if (sci === ver) return true;

  if (HOUSEHOLD_VERNAMACS.has(raw)) return false;

  const sciStem = stripScientificTail(sci);
  const verStem = stripEnglishTail(ver);
  if (sciStem.length >= 4 && verStem.length >= 4 && sciStem === verStem) {
    return true;
  }
  if (ver.startsWith(sci) && ver.length - sci.length <= 4) {
    return true;
  }
  return false;
}

function acceptLayman(scientific: string, candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (isRedundantVernacular(scientific, trimmed)) return null;
  return trimmed;
}

/**
 * Everyday title under a scientific name. Curated vernaculars first, then
 * shipped common names, then regular English endings (-idae → -ids).
 * Returns null when we only have a Latin echo or a rank gloss.
 */
export function laymanTitle(taxon: Taxon): string | null {
  const curated = acceptLayman(taxon.name, CURATED_LAYMAN[taxon.name.toLowerCase()]);
  if (curated) return curated;

  const common = acceptLayman(taxon.name, primaryCommonName(taxon.id));
  if (common) return common;

  const fromEnding = vernacularFromEnding(taxon.name);
  if (!fromEnding) return null;
  // Family / subfamily English (-ids, -ines) is the regular vernacular.
  // Superfamily -oids that only echo the Latin are omitted.
  if (taxon.name.endsWith("idae") || taxon.name.endsWith("inae")) return fromEnding;
  return acceptLayman(taxon.name, fromEnding);
}

/** Standard English from regular zoological endings. Returns null if unsure. */
export function vernacularFromEnding(name: string): string | null {
  if (name.length < 6) return null;
  if (name.endsWith("idae")) {
    return `${name.slice(0, -4).toLowerCase()}ids`;
  }
  if (name.endsWith("inae")) {
    return `${name.slice(0, -4).toLowerCase()}ines`;
  }
  if (name.endsWith("oidea")) {
    return `${name.slice(0, -5).toLowerCase()}oids`;
  }
  return null;
}
