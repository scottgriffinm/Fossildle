import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { laymanTitle, vernacularFromEnding } from "./layman";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { Taxon, TaxonomyData } from "./types";

function taxon(name: string, rank = "unranked", id = 1): Taxon {
  return { id, name, rank, parentId: null };
}

describe("layman titles", () => {
  it("uses the curated vernacular for familiar groups", () => {
    expect(laymanTitle(taxon("Mammalia", "class"))).toBe("mammals");
    expect(laymanTitle(taxon("Animalia", "kingdom"))).toBe("animals");
    expect(laymanTitle(taxon("Dinosauria"))).toBe("dinosaurs");
    expect(laymanTitle(taxon("Chordata", "phylum"))).toBe("chordates");
    expect(laymanTitle(taxon("Trilobita", "class"))).toBe("trilobites");
    expect(laymanTitle(taxon("Ammonoidea", "class"))).toBe("ammonites");
    expect(laymanTitle(taxon("Porifera", "phylum"))).toBe("sponges");
  });

  it("does not invent a fake common name for an unknown clade", () => {
    expect(laymanTitle(taxon("Eucrocopoda"))).toBe("a clade");
    expect(laymanTitle(taxon("Eucrocopoda"))).not.toMatch(/lizard|crocodile people/i);
    expect(vernacularFromEnding("Eucrocopoda")).toBeNull();
  });

  it("turns regular family endings into standard English, not a story", () => {
    expect(vernacularFromEnding("Tyrannosauridae")).toBe("tyrannosaurids");
    expect(laymanTitle(taxon("Tyrannosauridae", "family"))).toBe("tyrannosaurids");
    expect(laymanTitle(taxon("Tyrannosaurinae", "subfamily"))).toBe("tyrannosaurines");
    expect(laymanTitle(taxon("Tyrannosauroidea", "superfamily"))).toBe("tyrannosauroids");
  });

  it("falls back to a rank gloss when there is no vernacular", () => {
    expect(laymanTitle(taxon("Banffozoa", "class"))).toBe("a class");
    expect(laymanTitle(taxon("Vetulicolia", "phylum"))).toBe("a phylum");
  });
});

describe("layman titles on the shipped tree", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);

  it("labels Mammalia and the T. rex genus from the catalog", () => {
    const mammalia = data.taxa.find((row) => row.name === "Mammalia");
    expect(mammalia).toBeTruthy();
    expect(laymanTitle(mammalia!)).toBe("mammals");

    const rex = tax.require(parsePbdbOid("txn:38613"));
    expect(laymanTitle(rex)).toBe("T. rex");
  });

  it("never returns an empty string", () => {
    for (const name of ["Animalia", "Bilateria", "Eubilateria", "Protostomia", "Chordata"]) {
      const row = data.taxa.find((taxonRow) => taxonRow.name === name);
      expect(laymanTitle(row!), name).toBeTruthy();
    }
  });
});
