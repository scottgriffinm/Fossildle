import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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

describe("starter catalog", () => {
  it("ships 17 attributed fossils with local images", () => {
    expect(fossils).toHaveLength(17);
    const ids = new Set(fossils.map((fossil) => fossil.id));
    expect(ids.size).toBe(17);

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

  it("includes the seven Fossil Scout additions on shipped PBDB ids", () => {
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
    expect(seen.size).toBe(17);
    expect(seededShuffle(fossils, CATALOG_SEED)).toHaveLength(17);
    for (const expected of NEW_STARTERS) {
      expect(seen.has(expected.id)).toBe(true);
    }
  });
});
