import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mountedTaxonIds,
  neighborhoodExpandIds,
  paintTaxon,
  pathNeighborhoodIds,
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

function namesOf(tax: TaxonomyIndex, ids: number[]): string[] {
  return ids.map((id) => tax.require(id).name);
}

describe("tree paint from prune state", () => {
  const tax = new TaxonomyIndex(fixture());

  it("keeps Animalia and the rest of the neighborhood neutral before any guess", () => {
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

describe("path-neighborhood, not the full Animalia crown", () => {
  const tax = new TaxonomyIndex(fixture());

  it("opens on Animalia alone, with no shallow-child dump", () => {
    const open = tax.pruneRemaining(5, []);
    const hood = pathNeighborhoodIds(tax, 5, open);
    expect(namesOf(tax, hood)).toEqual(["Animalia"]);
    expect(neighborhoodExpandIds(tax, 5, open)).toEqual([]);
    const mounted = mountedTaxonIds(tax, [], hood, 5, open);
    expect(namesOf(tax, mounted)).toEqual(["Animalia"]);
  });

  it("after a distant miss shows the painted Animalia fork, not the secret genus", () => {
    const after = tax.pruneRemaining(5, [13]);
    const hood = namesOf(tax, pathNeighborhoodIds(tax, 5, after));
    expect(hood).toContain("Animalia");
    expect(hood).toContain("Arthropoda");
    expect(hood).toContain("Chordata");
    expect(hood).not.toContain("Tyrannosaurus");
    expect(hood).not.toContain("Phacops");
    expect(hood).not.toContain("Theropoda");
  });

  it("after a close miss keeps the Dinosauria frontier and drops the arthropod line's descendants", () => {
    const after = tax.pruneRemaining(5, [13, 7]);
    const hood = namesOf(tax, pathNeighborhoodIds(tax, 5, after));
    expect(hood).toEqual(
      expect.arrayContaining(["Animalia", "Chordata", "Dinosauria", "Ornithischia", "Theropoda"]),
    );
    expect(hood).toContain("Arthropoda");
    expect(hood).not.toContain("Phacops");
    expect(hood).not.toContain("Tyrannosaurus");
    expect(hood).not.toContain("Triceratops");
  });
});

describe("paint and neighborhood on the shipped Animalia artifact", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");
  const phacops = parsePbdbOid("txn:21701");
  const triceratops = parsePbdbOid("txn:38862");
  const animaliaKids = (tax.children.get(tax.rootId) ?? []).map((row) => row.name);

  it("does not dump Animalia plus all shallow children at the opening", () => {
    const open = tax.pruneRemaining(answer, []);
    const hood = pathNeighborhoodIds(tax, answer, open);
    expect(hood).toEqual([tax.rootId]);
    expect(hood.length).toBe(1);
    expect(animaliaKids.length).toBeGreaterThan(8);
    expect(data.taxa.length).toBeGreaterThan(10_000);
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

  it("keeps the first-miss neighborhood on the Eubilateria fork", () => {
    const after = tax.pruneRemaining(answer, [phacops]);
    const hood = namesOf(tax, pathNeighborhoodIds(tax, answer, after));
    expect(hood).toEqual(
      expect.arrayContaining(["Animalia", "Eubilateria", "Deuterostomia", "Protostomia"]),
    );
    expect(hood).not.toContain("Porifera");
    expect(hood).not.toContain("Cnidaria");
    expect(hood).not.toContain("Erniettomorpha");
    expect(hood).not.toContain("Hyolithelminthida");
    expect(hood).not.toContain("Tyrannosaurus");
    expect(hood).not.toContain("Chordata");
    expect(hood.length).toBeLessThan(12);
  });

  it("moves the neighborhood to the Dinosauria frontier after a close miss", () => {
    const after = tax.pruneRemaining(answer, [phacops, triceratops]);
    const hood = namesOf(tax, pathNeighborhoodIds(tax, answer, after));
    expect(hood).toEqual(
      expect.arrayContaining([
        "Animalia",
        "Chordata",
        "Reptilia",
        "Dinosauria",
        "Ornithischia",
        "Theropoda",
      ]),
    );
    expect(hood).toContain("Protostomia");
    expect(hood).not.toContain("Porifera");
    expect(hood).not.toContain("Cnidaria");
    expect(hood).not.toContain("Toyamasauripus");
    expect(hood).not.toContain("Dictyoolithidae");
    expect(hood).not.toContain("Tyrannosaurus");
    expect(hood.length).toBeLessThan(16);
  });

  it("expands the neighborhood so green path nodes and frontier forks are visible", () => {
    const after = tax.pruneRemaining(answer, [phacops, triceratops]);
    const hood = pathNeighborhoodIds(tax, answer, after);
    const expanded = neighborhoodExpandIds(tax, answer, after);
    const mounted = namesOf(tax, mountedTaxonIds(tax, expanded, hood, answer, after));
    expect(mounted).toContain("Animalia");
    expect(mounted).toContain("Dinosauria");
    expect(mounted).toContain("Ornithischia");
    expect(mounted).toContain("Theropoda");
    expect(mounted).not.toContain("Tyrannosaurus");
  });
});
