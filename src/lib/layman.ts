import { primaryCommonName } from "./names";
import type { Taxon } from "./types";

/**
 * Curated vernaculars for familiar Animalia groups. Keys are lowercase
 * scientific names. Values are everyday English — never invented zoology.
 */
export const CURATED_LAYMAN: Record<string, string> = {
  animalia: "animals",
  porifera: "sponges",
  cnidaria: "cnidarians",
  ctenophora: "comb jellies",
  placozoa: "placozoans",
  bilateria: "bilaterians",
  eubilateria: "eubilaterians",
  protostomia: "protostomes",
  deuterostomia: "deuterostomes",
  ecdysozoa: "ecdysozoans",
  spiralia: "spiralians",
  lophotrochozoa: "lophotrochozoans",
  chordata: "chordates",
  vertebrata: "vertebrates",
  tunicata: "tunicates",
  cephalochordata: "lancelets",
  ambulacraria: "ambulacrarians",
  echinodermata: "echinoderms",
  hemichordata: "hemichordates",
  arthropoda: "arthropods",
  euarthropoda: "arthropods",
  mollusca: "molluscs",
  annelida: "annelid worms",
  brachiopoda: "brachiopods",
  bryozoa: "bryozoans",
  ectoprocta: "bryozoans",
  nematoda: "roundworms",
  nemata: "roundworms",
  nemertea: "ribbon worms",
  nemertini: "ribbon worms",
  platyhelminthes: "flatworms",
  tardigrada: "tardigrades",
  onychophora: "velvet worms",
  priapulida: "priapulid worms",
  rotifera: "rotifers",
  sipuncula: "peanut worms",
  sipunculida: "peanut worms",
  chaetognatha: "arrow worms",
  gastrotricha: "gastrotrichs",
  kinorhyncha: "mud dragons",
  loricifera: "loriciferans",
  entoprocta: "entoprocts",
  phoronida: "horseshoe worms",
  acanthocephala: "thorny-headed worms",
  hyolitha: "hyoliths",
  lobopodia: "lobopodians",
  problematica: "problematica",
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
  tetrapoda: "tetrapods",
  tetrapodomorpha: "tetrapodomorphs",
  amniota: "amniotes",
  sauropsida: "sauropsids",
  synapsida: "synapsids",
  diapsida: "diapsids",
  archosauria: "archosaurs",
  dinosauria: "dinosaurs",
  saurischia: "saurischian dinosaurs",
  ornithischia: "ornithischian dinosaurs",
  theropoda: "theropods",
  sauropoda: "sauropods",
  sauropodomorpha: "sauropodomorphs",
  ceratopsia: "ceratopsians",
  thyreophora: "armored dinosaurs",
  ornithopoda: "ornithopods",
  coelurosauria: "coelurosaurs",
  tyrannosauroidea: "tyrannosauroids",
  insecta: "insects",
  arachnida: "arachnids",
  myriapoda: "myriapods",
  malacostraca: "malacostracans",
  branchiopoda: "branchiopods",
  ostracoda: "ostracods",
  trilobita: "trilobites",
  merostomata: "merostomes",
  xiphosura: "horseshoe crabs",
  pycnogonida: "sea spiders",
  gastropoda: "gastropods",
  bivalvia: "bivalves",
  cephalopoda: "cephalopods",
  ammonoidea: "ammonites",
  nautiloidea: "nautiloids",
  coleoidea: "coleoids",
  polyplacophora: "chitons",
  scaphopoda: "tusk shells",
  anthozoa: "corals and anemones",
  hydrozoa: "hydrozoans",
  scyphozoa: "jellyfish",
  cubozoa: "box jellyfish",
  crinoidea: "crinoids",
  asteroidea: "starfish",
  ophiuroidea: "brittle stars",
  echinoidea: "sea urchins",
  holothuroidea: "sea cucumbers",
  blastoidea: "blastoids",
  placodermi: "placoderms",
  arthrodira: "arthrodires",
  acanthodii: "acanthodians",
  conodonta: "conodonts",
  carnivora: "carnivorans",
  proboscidea: "elephants and kin",
  primates: "primates",
  rodentia: "rodents",
  cetacea: "whales and dolphins",
  artiodactyla: "even-toed ungulates",
  perissodactyla: "odd-toed ungulates",
  crocodylia: "crocodilians",
  squamata: "lizards and snakes",
  testudines: "turtles",
  pterosauria: "pterosaurs",
  ichthyosauria: "ichthyosaurs",
  plesiosauria: "plesiosaurs",
  dimetrodon: "Dimetrodon",
};

const RANK_GLOSS: Record<string, string> = {
  kingdom: "a kingdom",
  phylum: "a phylum",
  subphylum: "a subphylum",
  superclass: "a superclass",
  class: "a class",
  subclass: "a subclass",
  infraclass: "an infraclass",
  cohort: "a cohort",
  superorder: "a superorder",
  order: "an order",
  suborder: "a suborder",
  infraorder: "an infraorder",
  superfamily: "a superfamily",
  family: "a family",
  subfamily: "a subfamily",
  tribe: "a tribe",
  genus: "a genus",
};

/**
 * Everyday title under a scientific name. Curated map first, then shipped
 * common names, then regular English endings (-idae → -ids). Rank gloss is
 * last and only names the Linnaean rank — it does not invent a vernacular.
 */
export function laymanTitle(taxon: Taxon): string | null {
  const curated = CURATED_LAYMAN[taxon.name.toLowerCase()];
  if (curated) return curated;

  const common = primaryCommonName(taxon.id);
  if (common) return common;

  const fromEnding = vernacularFromEnding(taxon.name);
  if (fromEnding) return fromEnding;

  return RANK_GLOSS[taxon.rank] ?? (taxon.rank === "unranked" || taxon.rank === "informal" ? "a clade" : null);
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
