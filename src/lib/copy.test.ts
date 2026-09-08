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
  "src/components/TaxonomyTree.tsx",
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

  it("keeps the one-row rank path and an expandable outline, not a cladogram", () => {
    for (const file of PLAY_UI) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/cladogram/);
      expect(src, file).not.toMatch(/buildCabinetTree/);
    }
    const app = readFileSync(path.join(process.cwd(), "src/components/FossildleApp.tsx"), "utf8");
    const tree = readFileSync(path.join(process.cwd(), "src/components/TaxonomyTree.tsx"), "utf8");
    expect(app).toMatch(/TaxonomyPath/);
    expect(app).toMatch(/TaxonomyTree/);
    expect(tree).toMatch(/tax-tree/);
    expect(tree).toMatch(/laymanTitle/);
    expect(tree).not.toMatch(/\+\s*\/\s*-/);
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

  it("lets the outline use leftover vertical space and scroll inside the panel", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.play-side[\s\S]*?flex:\s*1 1 auto/);
    expect(css).toMatch(/\.tree-panel[\s\S]*?flex:\s*1 1 auto/);
    expect(css).toMatch(/\.tree-panel[\s\S]*?max-height:\s*min\(/);
    expect(css).toMatch(/\.tree-panel[\s\S]*?min-height:\s*0/);
    expect(css).toMatch(/\.tree-scroll[\s\S]*?overflow:\s*auto/);
    expect(css).toMatch(/\.tree-scroll[\s\S]*?scrollbar-width:\s*none/);
    expect(css).toMatch(/\.tree-scroll::-webkit-scrollbar[\s\S]*?display:\s*none/);
  });
});
