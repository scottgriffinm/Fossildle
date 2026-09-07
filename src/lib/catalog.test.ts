import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fossils } from "./catalog";
import { puzzleForDay, seededShuffle, CATALOG_SEED, utcDayIndex } from "./daily";

const NEW_STARTERS = [
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
      expect(
        existsSync(path.join(process.cwd(), "public", fossil.imageSrc.replace(/^\//, ""))),
      ).toBe(true);
    }
  });

  it("includes the fifteen Fossil Scout additions on shipped PBDB ids", () => {
    for (const expected of NEW_STARTERS) {
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
    for (const expected of NEW_STARTERS) {
      expect(seen.has(expected.id)).toBe(true);
    }
  });
});
