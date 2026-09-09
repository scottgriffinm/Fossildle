import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifestJson from "../../public/fossils/manifest.json";
import { fossils } from "./catalog";
import { puzzleForDay, seededShuffle, CATALOG_SEED, utcDayIndex } from "./daily";

const NEW_STARTERS = [
  { id: "anomalocaris-canadensis", taxon: "Anomalocaris", taxonId: 7370 },
  { id: "baculites-ozan", taxon: "Baculites", taxonId: 14603 },
  { id: "stegosaurus-stenops", taxon: "Stegosaurus", taxonId: 38814 },
  { id: "mucrospirifer-mucronatus", taxon: "Mucrospirifer", taxonId: 29445 },
  { id: "bothriolepis-canadensis", taxon: "Bothriolepis", taxonId: 176322 },
  { id: "allosaurus-atrox", taxon: "Allosaurus", taxonId: 38590 },
  { id: "calymene-blumenbachii", taxon: "Calymene", taxonId: 21478 },
] as const;

const SCOUT_BATCH = [
  { id: "isotelus-maximus", taxon: "Isotelus", taxonId: 20000 },
  { id: "olenellus-thompsoni", taxon: "Olenellus", taxonId: 19149 },
  { id: "asaphus-lepidurus", taxon: "Asaphus", taxonId: 19864 },
  { id: "flexicalymene-meeki", taxon: "Flexicalymene", taxonId: 21574 },
  { id: "paradoxides-bohemicus", taxon: "Paradoxides", taxonId: 19422 },
  { id: "dactylioceras-sp", taxon: "Dactylioceras", taxonId: 14749 },
  { id: "goniatites-sp", taxon: "Goniatites", taxonId: 13727 },
  { id: "heliophyllum-halli", taxon: "Heliophyllum", taxonId: 5489 },
  { id: "favosites-dundee", taxon: "Favosites", taxonId: 4880 },
  { id: "encrinus-liliiformis", taxon: "Encrinus", taxonId: 32698 },
  { id: "opabinia-regalis", taxon: "Opabinia", taxonId: 7377 },
  { id: "hallucigenia-sparsa", taxon: "Hallucigenia", taxonId: 18884 },
  { id: "dimetrodon-limbatus", taxon: "Dimetrodon", taxonId: 38904 },
  { id: "coelophysis-bauri", taxon: "Coelophysis", taxonId: 38520 },
  { id: "basilosaurus-cetoides", taxon: "Basilosaurus", taxonId: 36681 },
] as const;

describe("starter catalog", () => {
  it("ships 32 attributed fossils with local images", () => {
    expect(fossils).toHaveLength(32);
    const ids = new Set(fossils.map((fossil) => fossil.id));
    expect(ids.size).toBe(32);

    for (const fossil of fossils) {
      expect(fossil.attribution.length).toBeGreaterThan(0);
      expect(fossil.license.length).toBeGreaterThan(0);
      expect(fossil.commons_file.startsWith("File:")).toBe(true);
      expect(fossil.imageSrc).toBe(`/fossils/${fossil.id}.jpg`);
      const imagePath = path.join(process.cwd(), "public", fossil.imageSrc.replace(/^\//, ""));
      expect(existsSync(imagePath)).toBe(true);
      const manifest = manifestJson.find((entry) => entry.id === fossil.id);
      expect(manifest, fossil.id).toBeTruthy();
      expect(manifest?.commons_file).toBe(fossil.commons_file);
      expect(statSync(imagePath).size).toBe(manifest?.bytes);
    }
  });

  it("includes the seven Fossil Scout additions on shipped PBDB ids", () => {
    for (const expected of NEW_STARTERS) {
      const fossil = fossils.find((row) => row.id === expected.id);
      expect(fossil, expected.id).toBeTruthy();
      expect(fossil?.taxon).toBe(expected.taxon);
      expect(fossil?.taxonId).toBe(expected.taxonId);
    }
  });

  it("skips KEEP-list genera missing from shipped taxonomy.json", () => {
    const skipped = ["Eurypterus", "Halysites", "Marrella", "Wiwaxia", "Megaloceros"];
    const taxa = new Set(fossils.map((fossil) => fossil.taxon));
    for (const name of skipped) {
      expect(taxa.has(name)).toBe(false);
    }
  });

  it("does not ship Commons files that print the taxon name on the photo", () => {
    const banned = [
      "File:Encrinus liliiformis MNHN.JPG",
      "File:Perisphinctes ammonite.jpg",
      "File:Dimetrodon limbatus AMNH 4636.JPG",
      "File:Stegosaurus stenops (stegosaur dinosaur dorsal plate) (Morrison Formation, Upper Jurassic; Dinosaur National Monument, Utah, USA) (48696019227).jpg",
      "File:Allosaurus atrox (theropod dinosaur) (Morrison Formation, Upper Jurassic; Carnegie Quarry, Dinosaur National Monument, Utah, USA) 7 (48691921341).jpg",
    ];
    const shipped = new Set(fossils.map((fossil) => fossil.commons_file));
    for (const file of banned) {
      expect(shipped.has(file), file).toBe(false);
    }
  });

  it("includes the Fossil Scout batch on shipped PBDB ids", () => {
    for (const expected of SCOUT_BATCH) {
      const fossil = fossils.find((row) => row.id === expected.id);
      expect(fossil, expected.id).toBeTruthy();
      expect(fossil?.taxon).toBe(expected.taxon);
      expect(fossil?.taxonId).toBe(expected.taxonId);
    }
  });

  it("keeps the expanded pool in the daily cycle", () => {
    const start = utcDayIndex(new Date("2026-01-01T00:00:00Z"));
    const seen = new Set<string>();
    for (let i = 0; i < fossils.length; i += 1) {
      const date = new Date((start + i) * 86_400_000);
      seen.add(puzzleForDay(fossils, date).fossil.id);
    }
    expect(seen.size).toBe(32);
    expect(seededShuffle(fossils, CATALOG_SEED)).toHaveLength(32);
    for (const expected of [...NEW_STARTERS, ...SCOUT_BATCH]) {
      expect(seen.has(expected.id)).toBe(true);
    }
  });
});
