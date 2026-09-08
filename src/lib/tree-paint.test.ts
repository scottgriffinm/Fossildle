import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mountedTaxonIds,
  openingExpandedIds,
  paintTaxon,
  sharedPathExpandIds,
} from "./tree-paint";
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

describe("tree paint from prune state", () => {
  const tax = new TaxonomyIndex(fixture());

  it("keeps the full scaffold neutral, including Animalia, before any guess", () => {
    const open = tax.pruneRemaining(5, []);
    expect(paintTaxon(tax, 1, 5, open)).toBe("neutral");
    expect(paintTaxon(tax, 12, 5, open)).toBe("neutral");
    expect(paintTaxon(tax, 5, 5, open)).toBe("neutral");
    expect(paintTaxon(tax, 13, 5, open)).toBe("neutral");
  });

  it("greens the confirmed shared path and reds the ruled-out exclusive branch", () => {
    const after = tax.pruneRemaining(5, [13]);
    expect(tax.require(after.constraintId).name).toBe("Animalia");
    expect(paintTaxon(tax, 1, 5, after)).toBe("green");
    expect(paintTaxon(tax, 12, 5, after)).toBe("red");
    expect(paintTaxon(tax, 13, 5, after)).toBe("red");
    expect(paintTaxon(tax, 2, 5, after)).toBe("neutral");
    expect(paintTaxon(tax, 5, 5, after)).toBe("neutral");
    expect(paintTaxon(tax, 11, 5, after)).toBe("neutral");
  });

  it("still paints nodes outside the remaining set when they are not on the shared path", () => {
    const after = tax.pruneRemaining(5, [13, 7]);
    expect(tax.require(after.constraintId).name).toBe("Dinosauria");
    expect(paintTaxon(tax, 1, 5, after)).toBe("green");
    expect(paintTaxon(tax, 2, 5, after)).toBe("green");
    expect(paintTaxon(tax, 3, 5, after)).toBe("green");
    expect(paintTaxon(tax, 6, 5, after)).toBe("red");
    expect(paintTaxon(tax, 7, 5, after)).toBe("red");
    expect(paintTaxon(tax, 10, 5, after)).toBe("red");
    expect(paintTaxon(tax, 4, 5, after)).toBe("neutral");
    expect(paintTaxon(tax, 8, 5, after)).toBe("neutral");
  });

  it("greens the whole answer path on a hit", () => {
    const won = tax.pruneRemaining(5, [13, 5]);
    expect(paintTaxon(tax, 1, 5, won, "won")).toBe("green");
    expect(paintTaxon(tax, 5, 5, won, "won")).toBe("green");
    expect(paintTaxon(tax, 12, 5, won, "won")).toBe("red");
    expect(paintTaxon(tax, 9, 5, won, "won")).toBe("neutral");
  });
});

describe("lazy mount of the outline", () => {
  const tax = new TaxonomyIndex(fixture());

  it("opens on Animalia plus shallow children, not the whole tree", () => {
    const expanded = openingExpandedIds(tax);
    const mounted = mountedTaxonIds(tax, expanded).map((id) => tax.require(id).name);
    expect(expanded).toEqual([1]);
    expect(mounted).toEqual(["Animalia", "Arthropoda", "Chordata"]);
    expect(mounted).not.toContain("Tyrannosaurus");
    expect(mounted).not.toContain("Phacops");
  });

  it("only mounts descendants of expanded nodes", () => {
    const mounted = mountedTaxonIds(tax, [1, 2]).map((id) => tax.require(id).name);
    expect(mounted).toEqual(["Animalia", "Arthropoda", "Chordata", "Dinosauria", "Mammalia"]);
    expect(mounted).not.toContain("Theropoda");
  });
});

describe("paint and mount on the shipped Animalia artifact", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");
  const phacops = parsePbdbOid("txn:21701");
  const triceratops = parsePbdbOid("txn:38862");

  it("mounts far fewer nodes than the ~19k tree at the opening", () => {
    const mounted = mountedTaxonIds(tax, openingExpandedIds(tax));
    expect(mounted).toHaveLength(1 + (tax.children.get(tax.rootId)?.length ?? 0));
    expect(mounted.length).toBeLessThan(40);
    expect(data.taxa.length).toBeGreaterThan(10_000);
    expect(mounted).toContain(tax.rootId);
  });

  it("paints Eubilateria green and Protostomia red after an arthropod miss", () => {
    const after = tax.pruneRemaining(answer, [phacops]);
    expect(tax.require(after.constraintId).name).toBe("Eubilateria");
    const byName = (name: string) => {
      const row = data.taxa.find((taxon) => taxon.name === name);
      if (!row) throw new Error(name);
      return paintTaxon(tax, row.id, answer, after);
    };
    expect(byName("Animalia")).toBe("green");
    expect(byName("Bilateria")).toBe("green");
    expect(byName("Eubilateria")).toBe("green");
    expect(byName("Protostomia")).toBe("red");
    expect(byName("Arthropoda")).toBe("red");
    expect(byName("Porifera")).toBe("red");
    expect(byName("Deuterostomia")).toBe("neutral");
    expect(byName("Chordata")).toBe("neutral");
    expect(byName("Tyrannosaurus")).toBe("neutral");
  });

  it("expands the confirmed shared path after a miss so green nodes can show", () => {
    const after = tax.pruneRemaining(answer, [phacops, triceratops]);
    const ids = sharedPathExpandIds(tax, answer, after).map((id) => tax.require(id).name);
    expect(ids).toContain("Animalia");
    expect(ids).toContain("Dinosauria");
    expect(ids).not.toContain("Tyrannosaurus");
  });
});
