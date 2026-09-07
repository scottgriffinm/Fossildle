import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/components/SpecimenCard.tsx",
  "src/components/GuessInput.tsx",
  "src/components/FossildleApp.tsx",
  "src/app/layout.tsx",
];

const PLAY_UI = [
  "src/components/FossildleApp.tsx",
  "src/components/TaxonomyPath.tsx",
  "src/components/GuessBoard.tsx",
  "src/app/globals.css",
];

describe("player-facing guess copy", () => {
  it("says Guess the fossil, never Identify/Guess the animal", () => {
    for (const file of FILES) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/Identify the animal/i);
      expect(src, file).not.toMatch(/Guess the animal/i);
      expect(src, file).toMatch(/Guess the fossil/);
    }
  });

  it("uses a rank path, not a tree panel", () => {
    for (const file of PLAY_UI) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/TaxonomyTree/);
      expect(src, file).not.toMatch(/cladogram/);
      expect(src, file).not.toMatch(/tree-panel/);
      expect(src, file).not.toMatch(/buildCabinetTree/);
    }
  });
});
