import { describe, expect, it } from "vitest";
import { fossils } from "./catalog";
import {
  CATALOG_SEED,
  puzzleForDay,
  seededShuffle,
  utcDateKey,
  utcDayIndex,
} from "./daily";

describe("daily puzzle rotation", () => {
  it("uses UTC date keys and day indexes", () => {
    const date = new Date("2026-09-06T01:30:00-07:00");
    expect(utcDateKey(date)).toBe("2026-09-06");
    expect(utcDayIndex(date)).toBe(utcDayIndex(new Date("2026-09-06T23:00:00Z")));
  });

  it("shuffles the catalog with a fixed seed, then indexes by UTC day", () => {
    const a = seededShuffle(fossils, CATALOG_SEED).map((f) => f.id);
    const b = seededShuffle(fossils, CATALOG_SEED).map((f) => f.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(fossils.length);

    const day = new Date("2026-09-06T12:00:00Z");
    const puzzle = puzzleForDay(fossils, day);
    const pool = seededShuffle(fossils, CATALOG_SEED);
    expect(puzzle.fossil.id).toBe(pool[puzzle.dayIndex % pool.length]!.id);
  });

  it("keeps 2026-09-09 as Encrinus after unlabeled image swap", () => {
    const puzzle = puzzleForDay(fossils, new Date("2026-09-09T12:00:00Z"));
    expect(puzzle.fossil.id).toBe("encrinus-liliiformis");
    expect(puzzle.fossil.commons_file).toBe(
      "File:Encrinus liliiformis with barchiopods.jpg",
    );
  });

  it("cycles through the whole pool", () => {
    const start = utcDayIndex(new Date("2026-01-01T00:00:00Z"));
    const seen = new Set<string>();
    for (let i = 0; i < fossils.length; i += 1) {
      const date = new Date((start + i) * 86_400_000);
      seen.add(puzzleForDay(fossils, date).fossil.id);
    }
    expect(seen.size).toBe(fossils.length);
  });
});
