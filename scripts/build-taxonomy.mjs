#!/usr/bin/env node
/**
 * Offline taxonomy builder for Fossildle.
 *
 * Pulls PBDB data1.2 taxa via parent links (par / prl) and writes a
 * compact static tree rooted at Animalia. Network is used only here —
 * the web app ships the generated JSON and never calls PBDB at runtime.
 *
 * Scope (v1, "full fossil Animalia" without an 80k living-genus dump):
 *   - Animalia + every phylum, class, and order
 *   - Complete rootward paths for every starter fossil genus
 *   - All accepted genera in the major fossil clades that contain the
 *     starter pool (and a few neighboring famous groups)
 *   - Species/subspecies aliases under each starter genus
 *   - Walk-up of any missing parents until Animalia
 */

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "cache", "pbdb");
const FOSSILS_PATH = path.join(ROOT, "data", "fossils.json");
const OUT_PATH = path.join(ROOT, "public", "data", "taxonomy.json");
const META_PATH = path.join(ROOT, "public", "data", "taxonomy.meta.json");

const UA =
  "Fossildle/1.0 (offline taxonomy builder; https://github.com/scottgriffinm/Fossildle)";
const API = "https://paleobiodb.org/data1.2";
const ANIMALIA_ID = 67091;

const RANK_BY_CODE = {
  2: "subspecies",
  3: "species",
  4: "subgenus",
  5: "genus",
  6: "subtribe",
  7: "tribe",
  8: "subfamily",
  9: "family",
  10: "superfamily",
  11: "infraorder",
  12: "suborder",
  13: "order",
  14: "superorder",
  15: "infraclass",
  16: "subclass",
  17: "class",
  18: "superclass",
  19: "subphylum",
  20: "phylum",
  21: "superphylum",
  22: "subkingdom",
  23: "kingdom",
  25: "unranked",
  26: "informal",
};

const GENUS_CLADES = [
  "Dinosauria",
  "Trilobita",
  "Ammonoidea",
  "Placodermi",
  "Avialae",
  "Carnivora",
  "Proboscidea",
  "Arthrodira",
];

const EXTRA_GENERA = [
  "Anomalocaris",
  "Hallucigenia",
  "Opabinia",
  "Otodus",
  "Megalodon",
  "Basilosaurus",
  "Megatherium",
  "Glyptodon",
  "Pteranodon",
  "Ichthyosaurus",
  "Mosasaurus",
  "Elasmosaurus",
  "Dimetrodon",
  "Lystrosaurus",
  "Tiktaalik",
  "Eusthenopteron",
  "Bothriolepis",
  "Nautilus",
  "Belemnites",
  "Baculites",
  "Paradoxides",
  "Olenellus",
  "Calymene",
  "Asaphus",
  "Lingula",
  "Mucrospirifer",
  "Athyris",
  "Pentremites",
  "Clypeaster",
  "Micraster",
  "Crinoid",
  "Encrinus",
  "Favosites",
  "Heliophyllum",
  "Rugosa",
  "Archeocyatha",
];

function parseOid(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value);
  const match = text.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function normalizeRank(rank) {
  if (rank == null || rank === "") return "unranked";
  if (typeof rank === "number") return RANK_BY_CODE[rank] ?? `rank:${rank}`;
  const text = String(rank).toLowerCase();
  if (text === "unranked clade") return "unranked";
  return text;
}

function cacheKey(url) {
  return createHash("sha1").update(url).digest("hex") + ".json";
}

async function fetchJson(url, { retries = 4 } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, cacheKey(url));
  try {
    await access(file);
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    // network fetch
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const data = await res.json();
      await writeFile(file, JSON.stringify(data));
      return data;
    } catch (error) {
      lastError = error;
      const wait = 400 * 2 ** attempt;
      console.warn(`retry ${attempt + 1}/${retries + 1} after ${wait}ms: ${error.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

function taxaUrl(params) {
  const search = new URLSearchParams(params);
  return `${API}/taxa/list.json?${search.toString()}`;
}

function addRecord(taxa, record) {
  const id = parseOid(record.oid ?? record.orig_no ?? record.vid);
  if (!id) return null;
  const parentId = parseOid(record.par ?? record.parent_no);
  const name = record.nam ?? record.taxon_name;
  if (!name) return null;
  const rank = normalizeRank(record.rnk ?? record.taxon_rank);
  const existing = taxa.get(id);
  if (
    existing &&
    existing.name === name &&
    (existing.parentId || parentId) &&
    existing.rank !== "unranked"
  ) {
    if (!existing.parentId && parentId) existing.parentId = parentId;
    return existing;
  }
  const taxon = {
    id,
    name,
    rank,
    parentId: parentId && parentId !== id ? parentId : null,
  };
  taxa.set(id, taxon);
  return taxon;
}

async function ingestList(taxa, params, label) {
  const url = taxaUrl(params);
  console.log(`fetch ${label}`);
  const data = await fetchJson(url);
  const records = data.records ?? [];
  for (const record of records) addRecord(taxa, record);
  console.log(`  +${records.length} records (tree ${taxa.size})`);
  return records;
}

async function walkMissingParents(taxa) {
  const pending = new Set();
  for (const taxon of taxa.values()) {
    if (taxon.id === ANIMALIA_ID) continue;
    if (taxon.parentId && !taxa.has(taxon.parentId)) pending.add(taxon.parentId);
  }

  let safety = 0;
  let previousKey = "";
  while (pending.size && safety < 40) {
    safety += 1;
    const batch = [...pending].sort((a, b) => a - b);
    const key = batch.join(",");
    if (key === previousKey) {
      console.warn(`parent walk stalled on ${batch.join(", ")}; will reconnect during trim`);
      break;
    }
    previousKey = key;
    pending.clear();
    const ids = batch.map((id) => `txn:${id}`).join(",");
    console.log(`walk parents batch ${safety} (${batch.length})`);
    const records = await ingestList(
      taxa,
      { id: ids, rel: "exact", show: "parent" },
      `parents x${batch.length}`,
    );
    // also grab all_parents for any still-open chains
    const stillMissing = batch.filter((id) => {
      const node = taxa.get(id);
      return !node || (node.id !== ANIMALIA_ID && node.parentId && !taxa.has(node.parentId));
    });
    if (stillMissing.length) {
      await ingestList(
        taxa,
        {
          id: stillMissing.map((id) => `txn:${id}`).join(","),
          rel: "all_parents",
          show: "parent",
        },
        `all_parents x${stillMissing.length}`,
      );
    }
    for (const record of records) {
      const parentId = parseOid(record.par);
      if (parentId && !taxa.has(parentId) && parentId !== ANIMALIA_ID) {
        pending.add(parentId);
      }
    }
    for (const taxon of taxa.values()) {
      if (taxon.id === ANIMALIA_ID) continue;
      if (taxon.parentId && !taxa.has(taxon.parentId)) pending.add(taxon.parentId);
    }
  }
}

function ancestorsOf(taxa, id) {
  const path = [];
  const seen = new Set();
  let cursor = taxa.get(id);
  while (cursor && !seen.has(cursor.id)) {
    path.push(cursor.id);
    seen.add(cursor.id);
    if (cursor.id === ANIMALIA_ID || !cursor.parentId) break;
    cursor = taxa.get(cursor.parentId);
  }
  return path;
}

function detectCycles(taxa) {
  const cycles = [];
  for (const start of taxa.values()) {
    const seen = new Set();
    let cursor = start;
    while (cursor) {
      if (seen.has(cursor.id)) {
        cycles.push(start.id);
        break;
      }
      seen.add(cursor.id);
      if (!cursor.parentId) break;
      cursor = taxa.get(cursor.parentId);
    }
  }
  return [...new Set(cycles)];
}

function trimToAnimalia(taxa) {
  const animalia = taxa.get(ANIMALIA_ID);
  if (!animalia) {
    throw new Error("Animalia (txn:67091) missing from assembled tree");
  }
  animalia.parentId = null;
  animalia.rank = "kingdom";

  const keep = new Set();
  for (const taxon of taxa.values()) {
    const path = ancestorsOf(taxa, taxon.id);
    if (path.includes(ANIMALIA_ID)) {
      for (const id of path) keep.add(id);
    }
  }

  for (const id of [...taxa.keys()]) {
    if (!keep.has(id)) taxa.delete(id);
  }

  // Defensive: if a kept node's parent escaped the cut, reconnect to Animalia
  for (const taxon of taxa.values()) {
    if (taxon.id === ANIMALIA_ID) {
      taxon.parentId = null;
      continue;
    }
    if (!taxon.parentId || !taxa.has(taxon.parentId)) {
      taxon.parentId = ANIMALIA_ID;
    }
  }
}

function validate(taxa, fossils) {
  const cycles = detectCycles(taxa);
  if (cycles.length) {
    throw new Error(`cycles detected at ids: ${cycles.slice(0, 8).join(", ")}`);
  }
  const missing = [];
  for (const fossil of fossils) {
    const id = parseOid(fossil.pbdb_oid);
    const taxon = taxa.get(id);
    if (!taxon) {
      missing.push(`${fossil.taxon} (${fossil.pbdb_oid})`);
      continue;
    }
    const path = ancestorsOf(taxa, id);
    if (!path.includes(ANIMALIA_ID)) {
      missing.push(`${fossil.taxon} has no path to Animalia`);
    }
    if (taxon.name.toLowerCase() !== fossil.taxon.toLowerCase()) {
      console.warn(
        `name mismatch ${fossil.taxon} vs PBDB ${taxon.name} (${fossil.pbdb_oid})`,
      );
    }
  }
  if (missing.length) {
    throw new Error(`starter fossils failed validation:\n- ${missing.join("\n- ")}`);
  }
}

async function main() {
  const fossils = JSON.parse(await readFile(FOSSILS_PATH, "utf8")).fossils;
  const taxa = new Map();
  const aliases = [];

  await ingestList(
    taxa,
    { name: "Animalia", rel: "exact", show: "parent" },
    "Animalia",
  );
  await ingestList(
    taxa,
    { base_name: "Animalia", rank: "phylum", show: "parent" },
    "Animalia phyla",
  );
  await ingestList(
    taxa,
    { base_name: "Animalia", rank: "class", show: "parent" },
    "Animalia classes",
  );
  await ingestList(
    taxa,
    { base_name: "Animalia", rank: "order", show: "parent" },
    "Animalia orders",
  );

  const starterIds = fossils.map((f) => f.pbdb_oid).join(",");
  await ingestList(
    taxa,
    { id: starterIds, rel: "exact", show: "parent" },
    "starter genera",
  );
  await ingestList(
    taxa,
    { id: starterIds, rel: "all_parents", show: "parent" },
    "starter all_parents",
  );

  for (const fossil of fossils) {
    const species = await ingestList(
      taxa,
      {
        id: fossil.pbdb_oid,
        rel: "all_children",
        rank: "species,subspecies",
        show: "parent",
      },
      `species of ${fossil.taxon}`,
    );
    const genusId = parseOid(fossil.pbdb_oid);
    for (const record of species) {
      const name = record.nam;
      if (!name) continue;
      aliases.push({ name, id: genusId });
      // Keep species nodes out of the playable tree; aliases handle normalization.
      const speciesId = parseOid(record.oid);
      if (speciesId) taxa.delete(speciesId);
    }
    aliases.push({ name: fossil.taxon, id: genusId });
  }

  for (const clade of GENUS_CLADES) {
    await ingestList(
      taxa,
      {
        base_name: clade,
        rank: "genus",
        status: "accepted",
        show: "parent",
      },
      `genera in ${clade}`,
    );
  }

  if (EXTRA_GENERA.length) {
    await ingestList(
      taxa,
      {
        name: EXTRA_GENERA.join(","),
        rel: "exact",
        show: "parent",
      },
      "extra famous genera",
    );
    await ingestList(
      taxa,
      {
        name: EXTRA_GENERA.join(","),
        rel: "all_parents",
        show: "parent",
      },
      "extra famous all_parents",
    );
  }

  await walkMissingParents(taxa);
  trimToAnimalia(taxa);
  validate(taxa, fossils);

  const list = [...taxa.values()].sort((a, b) => a.id - b.id);
  const genusCount = list.filter((t) => t.rank === "genus").length;
  const payload = {
    version: 1,
    rootId: ANIMALIA_ID,
    source: "Paleobiology Database data1.2",
    generatedAt: new Date().toISOString(),
    taxa: list,
    aliases: uniqueAliases(aliases),
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload));
  const meta = {
    taxonCount: list.length,
    genusCount,
    aliasCount: payload.aliases.length,
    rootId: ANIMALIA_ID,
    bytes: Buffer.byteLength(JSON.stringify(payload)),
    clades: GENUS_CLADES,
    starterGenera: fossils.map((f) => f.taxon),
    generatedAt: payload.generatedAt,
  };
  await writeFile(META_PATH, JSON.stringify(meta, null, 2) + "\n");
  console.log(`wrote ${OUT_PATH}`);
  console.log(JSON.stringify(meta, null, 2));
}

function uniqueAliases(aliases) {
  const seen = new Set();
  const out = [];
  for (const alias of aliases) {
    const key = `${alias.name.toLowerCase()}|${alias.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
