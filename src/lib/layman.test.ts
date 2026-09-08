import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isRedundantVernacular, laymanTitle, vernacularFromEnding } from "./layman";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { Taxon, TaxonomyData } from "./types";

function taxon(name: string, rank = "unranked", id = 1): Taxon {
  return { id, name, rank, parentId: null };
}

describe("layman titles", () => {
  it("uses a real vernacular for familiar groups", () => {
    expect(laymanTitle(taxon("Mammalia", "class"))).toBe("mammals");
    expect(laymanTitle(taxon("Animalia", "kingdom"))).toBe("animals");
    expect(laymanTitle(taxon("Dinosauria"))).toBe("dinosaurs");
    expect(laymanTitle(taxon("Trilobita", "class"))).toBe("trilobites");
    expect(laymanTitle(taxon("Ammonoidea", "class"))).toBe("ammonites");
    expect(laymanTitle(taxon("Porifera", "phylum"))).toBe("sponges");
    expect(laymanTitle(taxon("Aves", "class"))).toBe("birds");
    expect(laymanTitle(taxon("Cnidaria", "phylum"))).toBe("jellyfish and corals");
    expect(laymanTitle(taxon("Nemertea", "phylum"))).toBe("ribbon worms");
  });

  it("omits Latin echoes instead of restating the scientific name", () => {
    expect(laymanTitle(taxon("Bilateria"))).toBeNull();
    expect(laymanTitle(taxon("Eubilateria"))).toBeNull();
    expect(laymanTitle(taxon("Protostomia"))).toBeNull();
    expect(laymanTitle(taxon("Chordata", "phylum"))).toBeNull();
    expect(isRedundantVernacular("Bilateria", "bilaterians")).toBe(true);
    expect(isRedundantVernacular("Cnidaria", "cnidarians")).toBe(true);
    expect(isRedundantVernacular("Porifera", "sponges")).toBe(false);
  });

  it("omits rank gloss and does not invent a fake common name", () => {
    expect(laymanTitle(taxon("Eucrocopoda"))).toBeNull();
    expect(laymanTitle(taxon("Banffozoa", "class"))).toBeNull();
    expect(laymanTitle(taxon("Vetulicolia", "phylum"))).toBeNull();
    expect(laymanTitle(taxon("Epitheliozoa"))).toBeNull();
    expect(isRedundantVernacular("Epitheliozoa", "a clade")).toBe(true);
    expect(isRedundantVernacular("Erniettomorpha", "a class")).toBe(true);
    expect(vernacularFromEnding("Eucrocopoda")).toBeNull();
  });

  it("turns regular family endings into standard English, not a story", () => {
    expect(vernacularFromEnding("Tyrannosauridae")).toBe("tyrannosaurids");
    expect(laymanTitle(taxon("Tyrannosauridae", "family"))).toBe("tyrannosaurids");
    expect(laymanTitle(taxon("Tyrannosaurinae", "subfamily"))).toBe("tyrannosaurines");
    expect(laymanTitle(taxon("Tyrannosauroidea", "superfamily"))).toBeNull();
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

  it("omits echoes and rank gloss on the opening Animalia children", () => {
    const kids = data.taxa.filter((row) => row.parentId === data.rootId);
    const byName = Object.fromEntries(kids.map((row) => [row.name, laymanTitle(row)]));

    expect(laymanTitle(data.taxa.find((row) => row.id === data.rootId)!)).toBe("animals");
    expect(byName.Porifera).toBe("sponges");
    expect(byName.Nemertea).toBe("ribbon worms");
    expect(byName.Cnidaria).toBe("jellyfish and corals");
    expect(byName.Bilateria).toBeNull();
    expect(byName.Epitheliozoa).toBeNull();
    expect(byName.Erniettomorpha).toBeNull();
    expect(byName.Eumetazoa).toBeNull();
    expect(byName.Hyolithelminthida).toBeNull();
    expect(byName.Mesozoa).toBeNull();
    expect(byName.Petalonamae).toBeNull();

    for (const row of kids) {
      const title = laymanTitle(row);
      if (title) {
        expect(isRedundantVernacular(row.name, title), `${row.name} → ${title}`).toBe(false);
        expect(title).not.toMatch(/^(a|an)\s+/i);
      }
    }
  });
});
