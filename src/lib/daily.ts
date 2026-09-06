import type { FossilRecord } from "./types";

/** Constant catalog seed. Changing this reshuffles the entire daily cycle. */
export const CATALOG_SEED = 0xf05511de;
export const MAX_GUESSES = 6;

export function utcDayIndex(date = new Date()): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );
}

export function utcDateKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const current = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = current;
  }
  return arr;
}

export function puzzleForDay(fossils: readonly FossilRecord[], date = new Date()) {
  if (fossils.length === 0) {
    throw new Error("Fossil pool is empty");
  }
  const dayIndex = utcDayIndex(date);
  const pool = seededShuffle(fossils, CATALOG_SEED);
  const poolIndex = dayIndex % pool.length;
  return {
    fossil: pool[poolIndex]!,
    dayIndex,
    dateKey: utcDateKey(date),
    poolIndex,
    pool,
  };
}
