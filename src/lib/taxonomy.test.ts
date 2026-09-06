import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fossils } from "./catalog";
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
  return {
    version: 1,
    rootId: 1,
    taxa,
    aliases: [
      { name: "Tyrannosaurus rex", id: 5 },
      { name: "Phacops rana", id: 13 },
    ],
  };
}

describe("TaxonomyIndex helpers", () => {
  const tax = new TaxonomyIndex(fixture());

  it("walks pathToRoot without cycles", () => {
    expect(tax.pathToRoot(5).map((id) => tax.require(id).name)).toEqual([
      "Tyrannosaurus",
      "Theropoda",
      "Dinosauria",
      "Chordata",
      "Animalia",
    ]);
  });

  it("computes MRCA", () => {
    expect(tax.require(tax.mrca(5, 7)).name).toBe("Dinosauria");
    expect(tax.require(tax.mrca(5, 13)).name).toBe("Animalia");
    expect(tax.require(tax.mrca(5, 11)).name).toBe("Chordata");
    expect(tax.mrca(5, 5)).toBe(5);
  });

  it("prunes the exclusive branch of a wrong guess and tightens to the shared clade", () => {
    const afterArthropod = tax.pruneRemaining(5, [13]);
    expect(tax.require(afterArthropod.constraintId).name).toBe("Animalia");
    expect(afterArthropod.eliminated).toEqual([12]);
    expect(tax.isRemaining(13, afterArthropod)).toBe(false);
    expect(tax.isRemaining(5, afterArthropod)).toBe(true);
    expect(tax.isRemaining(11, afterArthropod)).toBe(true);

    const afterTriceratops = tax.pruneRemaining(5, [13, 7]);
    expect(tax.require(afterTriceratops.constraintId).name).toBe("Dinosauria");
    expect(tax.isRemaining(11, afterTriceratops)).toBe(false);
    expect(tax.isRemaining(7, afterTriceratops)).toBe(false);
    expect(tax.isRemaining(9, afterTriceratops)).toBe(true);
    expect(tax.isRemaining(5, afterTriceratops)).toBe(true);
    expect(tax.remainingGenera(afterTriceratops).map((t) => t.name)).toEqual([
      "Tyrannosaurus",
      "Diplodocus",
    ]);
  });

  it("normalizes a species binomial to its genus", () => {
    const state = tax.pruneRemaining(5, []);
    const resolved = tax.resolveGuess("Tyrannosaurus rex", state, []);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.taxon.name).toBe("Tyrannosaurus");
      expect(resolved.viaAlias).toBe("Tyrannosaurus rex");
    }
  });

  it("rejects higher taxa, unknown names, and pruned genera", () => {
    const state = tax.pruneRemaining(5, [13]);
    expect(tax.resolveGuess("Dinosauria", state, [])).toMatchObject({
      ok: false,
      reason: "not-genus",
    });
    expect(tax.resolveGuess("Nessie", state, [])).toMatchObject({
      ok: false,
      reason: "unknown",
    });
    expect(tax.resolveGuess("Phacops", state, [])).toMatchObject({
      ok: false,
      reason: "not-remaining",
    });
  });

  it("opens the cabinet on a rank that still splits remaining genera", () => {
    const open = tax.pruneRemaining(5, []);
    expect(tax.informativeBranches(open).map((b) => b.taxon.name).sort()).toEqual([
      "Arthropoda",
      "Chordata",
    ]);
    const after = tax.pruneRemaining(5, [13]);
    expect(tax.informativeBranches(after).every((b) => b.taxon.name !== "Arthropoda")).toBe(
      true,
    );
  });

  it("restricts autocomplete to remaining genera", () => {
    const open = tax.pruneRemaining(5, []);
    expect(tax.searchGenera("p", open).map((t) => t.name)).toContain("Phacops");
    const pruned = tax.pruneRemaining(5, [13]);
    expect(tax.searchGenera("p", pruned).map((t) => t.name)).not.toContain("Phacops");
  });
});

describe("shipped PBDB taxonomy artifact", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);

  it("has no cycles and every node reaches Animalia", () => {
    expect(tax.require(tax.rootId).name).toBe("Animalia");
    for (const taxon of data.taxa) {
      const path = tax.pathToRoot(taxon.id);
      const ids = new Set(path);
      expect(ids.size).toBe(path.length);
      expect(path.at(-1)).toBe(tax.rootId);
    }
  });

  it("resolves every starter fossil genus to Animalia", () => {
    for (const fossil of fossils) {
      const id = parsePbdbOid(fossil.pbdb_oid);
      const taxon = tax.require(id);
      expect(taxon.rank).toBe("genus");
      expect(taxon.name.toLowerCase()).toBe(fossil.taxon.toLowerCase());
      expect(tax.pathToRoot(id).at(-1)).toBe(tax.rootId);
    }
  });

  it("plays a fair prune sequence on the real tree", () => {
    const answer = parsePbdbOid("txn:38613"); // Tyrannosaurus
    const phacops = parsePbdbOid("txn:21701");
    const triceratops = parsePbdbOid("txn:38862");
    const first = tax.pruneRemaining(answer, [phacops]);
    expect(tax.require(first.constraintId).name).toBe("Eubilateria");
    expect(tax.isRemaining(phacops, first)).toBe(false);
    expect(tax.isRemaining(answer, first)).toBe(true);
    expect(tax.isRemaining(triceratops, first)).toBe(true);

    const second = tax.pruneRemaining(answer, [phacops, triceratops]);
    expect(tax.require(second.constraintId).name).toBe("Dinosauria");
    expect(tax.isRemaining(triceratops, second)).toBe(false);
    expect(tax.isRemaining(answer, second)).toBe(true);
    expect(tax.remainingGenera(second).length).toBeGreaterThan(1);
    expect(tax.remainingGenera(second).some((t) => t.id === answer)).toBe(true);
  });

  it("opens on phyla so the first view is wide", () => {
    const open = tax.pruneRemaining(parsePbdbOid("txn:38613"), []);
    const names = tax.informativeBranches(open).map((b) => b.taxon.name);
    expect(names).toEqual(expect.arrayContaining(["Chordata", "Arthropoda", "Mollusca"]));
    expect(names.length).toBeGreaterThanOrEqual(3);
  });
});
