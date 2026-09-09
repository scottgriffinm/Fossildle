import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { remainingFossilsCopy } from "./copy";

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

  it("keeps the one-row rank path and guess history, not a neighborhood tree", () => {
    for (const file of PLAY_UI) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/cladogram/);
      expect(src, file).not.toMatch(/buildCabinetTree/);
      expect(src, file).not.toMatch(/TaxonomyTree/);
      expect(src, file).not.toMatch(/pathNeighborhoodIds/);
      expect(src, file).not.toMatch(/tree-panel/);
      expect(src, file).not.toMatch(/tax-tree/);
    }
    const app = readFileSync(path.join(process.cwd(), "src/components/FossildleApp.tsx"), "utf8");
    const board = readFileSync(path.join(process.cwd(), "src/components/GuessBoard.tsx"), "utf8");
    expect(app).toMatch(/TaxonomyPath/);
    expect(app).toMatch(/GuessBoard/);
    expect(app).not.toMatch(/TaxonomyTree/);
    expect(board).toMatch(/guess-list/);
    expect(board).toMatch(/Match through/);
  });

  it("does not pad the path skeleton with clade placeholders", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/TaxonomyPath.tsx"), "utf8");
    expect(src).not.toMatch(/rank-label">clade</);
    expect(src).toMatch(/SKELETON_RANKS/);
  });

  it("centers rank-path arrows and hugs the fossil photo", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.rank-path\s*\{[^}]*align-items:\s*center/s);
    expect(css).toMatch(/\.rank-arrow\s*\{[^}]*align-items:\s*center/s);
    expect(css).not.toMatch(/linear-gradient\(45deg/);
    expect(css).not.toMatch(/background-size:\s*18px 18px/);

    const card = readFileSync(path.join(process.cwd(), "src/components/SpecimenCard.tsx"), "utf8");
    expect(card).not.toMatch(/\bfill\b/);
    expect(card).toMatch(/Guess the fossil/);
  });

  it("says fossils for the remaining count, with singular", () => {
    expect(remainingFossilsCopy(13293)).toBe("13,293 fossils still possible");
    expect(remainingFossilsCopy(1)).toBe("1 fossil still possible");
    expect(remainingFossilsCopy(0)).toBe("0 fossils still possible");

    const app = readFileSync(path.join(process.cwd(), "src/components/FossildleApp.tsx"), "utf8");
    const input = readFileSync(path.join(process.cwd(), "src/components/GuessInput.tsx"), "utf8");
    const about = readFileSync(path.join(process.cwd(), "src/app/about/page.tsx"), "utf8");
    expect(app).not.toMatch(/animals still possible/);
    expect(app).toMatch(/remainingFossilsCopy/);
    expect(input).not.toMatch(/No remaining animals match/);
    expect(input).toMatch(/No remaining fossils match/);
    expect(about).toMatch(/fossils that are still possible/);
    expect(about).not.toMatch(/animals that are still possible/);
    expect(about).toMatch(/Match through Eubilateria/);
    expect(about).not.toMatch(/neighborhood/);
    expect(about).not.toMatch(/outline under the path/);
  });
});

describe("specimen and rank-path chrome", () => {
  it("does not paint a striped letterbox behind the fossil photo", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).not.toMatch(/background-size:\s*18px 18px/);
    expect(css).not.toMatch(/linear-gradient\(45deg, #1a1611/);
    expect(css).toMatch(/\.specimen-frame[\s\S]*?background:\s*none/);
    expect(css).toMatch(/\.specimen-photo[\s\S]*?background:\s*none/);
  });

  it("collapses the leftover board to guesses and hugs the fossil", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).not.toMatch(/\.tree-panel/);
    expect(css).not.toMatch(/\.tree-scroll/);
    expect(css).not.toMatch(/\.tax-tree/);
    expect(css).not.toMatch(/\.tax-name/);
    expect(css).toMatch(/\.play-side\.is-empty[\s\S]*?display:\s*none/);
    expect(css).toMatch(/\.play-guesses[\s\S]*?max-height:\s*min\(/);
    expect(css).toMatch(/\.play-guesses[\s\S]*?scrollbar-width:\s*none/);
    expect(css).toMatch(/\.shell-play[\s\S]*?min-height:\s*100dvh/);
    expect(css).toMatch(/\.shell-play[\s\S]*?height:\s*100dvh/);
    expect(css).toMatch(/\.play-hero[\s\S]*?justify-content:\s*center/);
  });
});
