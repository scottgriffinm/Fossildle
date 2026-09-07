import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  colorRankPath,
  playRankPath,
  rankLabel,
  sharedDepthId,
  withConstraint,
} from "./rank-path";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { Taxon, TaxonomyData } from "./types";

function fixture(): TaxonomyData {
  const taxa: Taxon[] = [
    { id: 1, name: "Animalia", rank: "kingdom", parentId: null },
    { id: 2, name: "Chordata", rank: "phylum", parentId: 1 },
    { id: 3, name: "Dinosauria", rank: "unranked", parentId: 2 },
    { id: 4, name: "Theropoda", rank: "unranked", parentId: 3 },
    { id: 5, name: "Tyrannosaurus", rank: "genus", parentId: 4 },
    { id: 6, name: "Ornithischia", rank: "unranked", parentId: 3 },
    { id: 7, name: "Triceratops", rank: "genus", parentId: 6 },
    { id: 8, name: "Saurischia", rank: "unranked", parentId: 3 },
    { id: 9, name: "Diplodocus", rank: "genus", parentId: 8 },
    { id: 10, name: "Mammalia", rank: "class", parentId: 2 },
    { id: 11, name: "Smilodon", rank: "genus", parentId: 10 },
    { id: 12, name: "Arthropoda", rank: "phylum", parentId: 1 },
    { id: 13, name: "Phacops", rank: "genus", parentId: 12 },
  ];
  return { version: 1, rootId: 1, taxa, aliases: [] };
}

function names(segments: Array<Taxon | { taxon: Taxon }>): string[] {
  return segments.map((segment) => ("taxon" in segment ? segment.taxon.name : segment.name));
}

function states(segments: { state: string }[]): string[] {
  return segments.map((segment) => segment.state);
}

describe("play rank path", () => {
  const tax = new TaxonomyIndex(fixture());

  it("keeps real play ranks and named clades, not every PBDB stem", () => {
    expect(names(playRankPath(tax, 5))).toEqual([
      "Animalia",
      "Chordata",
      "Dinosauria",
      "Tyrannosaurus",
    ]);
    expect(playRankPath(tax, 5).map((taxon) => taxon.rank)).toEqual([
      "kingdom",
      "phylum",
      "unranked",
      "genus",
    ]);
    expect(names(playRankPath(tax, 5))).not.toContain("Theropoda");
  });

  it("does not invent ranks that are not on the path", () => {
    const path = playRankPath(tax, 13);
    expect(names(path)).toEqual(["Animalia", "Arthropoda", "Phacops"]);
    expect(path.some((taxon) => taxon.rank === "class")).toBe(false);
    expect(path.some((taxon) => taxon.rank === "order")).toBe(false);
  });

  it("labels unranked play clades as clade, not a fake rank", () => {
    expect(rankLabel(tax.require(3))).toBe("clade");
    expect(rankLabel(tax.require(2))).toBe("phylum");
  });
});

describe("green depth from MRCA / remaining constraint", () => {
  const tax = new TaxonomyIndex(fixture());

  it("starts green only at Animalia", () => {
    const open = tax.pruneRemaining(5, []);
    const path = colorRankPath(tax, 5, open);
    expect(sharedDepthId(tax, 5, open)).toBe(1);
    expect(names(path)).toEqual(["Animalia", "Chordata", "Dinosauria", "Tyrannosaurus"]);
    expect(states(path)).toEqual(["green", "unknown", "unknown", "unknown"]);
    expect(path.find((seg) => seg.taxon.name === "Tyrannosaurus")?.taxon.name).toBe(
      "Tyrannosaurus",
    );
    expect(path.at(-1)?.state).toBe("unknown");
  });

  it("greens the shared path through the MRCA after a distant miss", () => {
    const after = tax.pruneRemaining(5, [13]);
    expect(tax.require(after.constraintId).name).toBe("Animalia");
    const path = colorRankPath(tax, 5, after);
    expect(states(path)).toEqual(["green", "unknown", "unknown", "unknown"]);
    expect(names(path)).not.toContain("Arthropoda");
    expect(names(path)).not.toContain("Phacops");
  });

  it("greens down to Dinosauria after a close miss", () => {
    const after = tax.pruneRemaining(5, [13, 7]);
    expect(tax.require(after.constraintId).name).toBe("Dinosauria");
    const path = colorRankPath(tax, 5, after);
    expect(names(path)).toEqual(["Animalia", "Chordata", "Dinosauria", "Tyrannosaurus"]);
    expect(states(path)).toEqual(["green", "green", "green", "unknown"]);
    expect(names(path)).not.toContain("Ornithischia");
    expect(names(path)).not.toContain("Triceratops");
  });

  it("inserts a real constraint that is not already a play rank", () => {
    const after = tax.pruneRemaining(5, [11]);
    expect(tax.require(after.constraintId).name).toBe("Chordata");
    const tighter = {
      ...after,
      constraintId: 4,
      steps: [...after.steps, { guessId: 9, mrcaId: 4, prunedId: 8 }],
    };
    expect(names(withConstraint(tax, playRankPath(tax, 5), 4))).toEqual([
      "Animalia",
      "Chordata",
      "Dinosauria",
      "Theropoda",
      "Tyrannosaurus",
    ]);
    const path = colorRankPath(tax, 5, tighter);
    expect(names(path)).toContain("Theropoda");
    expect(path.find((seg) => seg.taxon.name === "Theropoda")?.state).toBe("green");
    expect(path.find((seg) => seg.taxon.name === "Tyrannosaurus")?.state).toBe("unknown");
  });

  it("turns the whole path green on a hit", () => {
    const won = tax.pruneRemaining(5, [13, 5]);
    expect(sharedDepthId(tax, 5, won)).toBe(5);
    const path = colorRankPath(tax, 5, won, "won");
    expect(states(path).every((state) => state === "green")).toBe(true);
    expect(names(path).at(-1)).toBe("Tyrannosaurus");
  });

  it("reveals remaining names after a loss without calling them green", () => {
    const lost = tax.pruneRemaining(5, [13, 7, 9]);
    const path = colorRankPath(tax, 5, lost, "lost");
    expect(path.find((seg) => seg.taxon.name === "Dinosauria")?.state).toBe("green");
    expect(path.find((seg) => seg.taxon.name === "Tyrannosaurus")?.state).toBe("revealed");
  });
});

describe("play path on the shipped Animalia artifact", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");
  const phacops = parsePbdbOid("txn:21701");
  const triceratops = parsePbdbOid("txn:38862");

  it("uses a short real-rank chain for Tyrannosaurus", () => {
    const path = playRankPath(tax, answer);
    expect(names(path)).toEqual([
      "Animalia",
      "Bilateria",
      "Eubilateria",
      "Deuterostomia",
      "Chordata",
      "Reptilia",
      "Dinosauria",
      "Tyrannosauridae",
      "Tyrannosaurus",
    ]);
    expect(names(path)).not.toContain("Osteichthyes");
    expect(names(path)).not.toContain("Dipnotetrapodomorpha");
    expect(names(path)).not.toContain("Amphibiosauria");
    expect(path.some((taxon) => taxon.rank === "subclass")).toBe(false);
  });

  it("greens through Eubilateria after an arthropod miss", () => {
    const after = tax.pruneRemaining(answer, [phacops]);
    expect(tax.require(after.constraintId).name).toBe("Eubilateria");
    const path = colorRankPath(tax, answer, after);
    expect(path.filter((seg) => seg.state === "green").map((seg) => seg.taxon.name)).toEqual([
      "Animalia",
      "Bilateria",
      "Eubilateria",
    ]);
    expect(path.find((seg) => seg.taxon.name === "Chordata")?.state).toBe("unknown");
    expect(path.find((seg) => seg.taxon.name === "Dinosauria")?.state).toBe("unknown");
    expect(path.find((seg) => seg.taxon.name === "Tyrannosaurus")?.state).toBe("unknown");
    expect(names(path)).not.toContain("Protostomia");
    expect(names(path)).not.toContain("Arthropoda");
    expect(names(path)).not.toContain("Phacops");
  });

  it("greens through Dinosauria after a close miss", () => {
    const after = tax.pruneRemaining(answer, [phacops, triceratops]);
    expect(tax.require(after.constraintId).name).toBe("Dinosauria");
    const path = colorRankPath(tax, answer, after);
    expect(path.filter((seg) => seg.state === "green").map((seg) => seg.taxon.name)).toEqual([
      "Animalia",
      "Bilateria",
      "Eubilateria",
      "Deuterostomia",
      "Chordata",
      "Reptilia",
      "Dinosauria",
    ]);
    expect(path.find((seg) => seg.taxon.name === "Tyrannosauridae")?.state).toBe("unknown");
    expect(names(path)).not.toContain("Ornithischia");
    expect(names(path)).not.toContain("Triceratops");
  });

  it("inserts Amniota when that is the remaining constraint", () => {
    const mammoth = parsePbdbOid("txn:43266");
    const after = tax.pruneRemaining(mammoth, [phacops, triceratops]);
    expect(tax.require(after.constraintId).name).toBe("Amniota");
    const path = colorRankPath(tax, mammoth, after);
    expect(names(path)).toContain("Amniota");
    expect(path.find((seg) => seg.taxon.name === "Amniota")?.state).toBe("green");
    expect(path.find((seg) => seg.taxon.name === "Mammalia")?.state).toBe("unknown");
    expect(names(path)).not.toContain("Porifera");
    expect(names(path)).not.toContain("Phacops");
  });
});
