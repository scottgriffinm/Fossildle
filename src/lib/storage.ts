import type { GameStatus } from "./types";

export type SavedGame = {
  dateKey: string;
  fossilId: string;
  guesses: number[];
  status: GameStatus;
};

const PREFIX = "fossildle:v1:";

export function loadSavedGame(dateKey: string): SavedGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + dateKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.dateKey !== dateKey || !Array.isArray(parsed.guesses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGame(state: SavedGame): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFIX + state.dateKey, JSON.stringify(state));
}
