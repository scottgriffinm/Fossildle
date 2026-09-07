import { describe, expect, it } from "vitest";
import { fossils } from "./catalog";
import { animalLabel, animalPhrase, articleFor, primaryCommonName } from "./names";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { TaxonomyData } from "./types";

describe("animal-facing names", () => {
  it("uses a / an correctly", () => {
    expect(articleFor("Tyrannosaurus")).toBe("a");
    expect(articleFor("Archaeopteryx")).toBe("an");
    expect(articleFor("woolly mammoth")).toBe("a");
  });

  it("prefers catalog common names for daily fossils", () => {
    const mammoth = fossils.find((fossil) => fossil.taxon === "Mammuthus");
    const rex = fossils.find((fossil) => fossil.taxon === "Tyrannosaurus");
    const smilodon = fossils.find((fossil) => fossil.taxon === "Smilodon");
    expect(animalLabel(mammoth!)).toBe("woolly mammoth");
    expect(animalPhrase(rex!)).toBe("a T. rex");
    expect(animalPhrase(smilodon!)).toBe("a saber-toothed cat");
  });
});

describe("shipped common-name aliases on the real tree", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);

  it("resolves PBDB nm2 and catalog vernaculars to remaining genera", () => {
    const tyrannosaurus = parsePbdbOid("txn:38613");
    const open = tax.pruneRemaining(tyrannosaurus, []);

    const rex = tax.resolveGuess("T. rex", open, []);
    expect(rex.ok).toBe(true);
    if (rex.ok) expect(rex.taxon.id).toBe(tyrannosaurus);

    const mammothId = parsePbdbOid("txn:43266");
    const mammoth = tax.resolveGuess("woolly mammoth", open, []);
    expect(mammoth.ok).toBe(true);
    if (mammoth.ok) expect(mammoth.taxon.id).toBe(mammothId);

    const saber = tax.resolveGuess("saber-toothed cat", open, []);
    expect(saber.ok).toBe(true);
    if (saber.ok) expect(saber.taxon.id).toBe(parsePbdbOid("txn:41079"));

    const hits = tax.searchAnimals("mammoth", open);
    expect(hits[0]?.taxon.name).toBe("Mammuthus");
    expect(hits[0]?.via).toBe("common");
    expect(primaryCommonName(mammothId)).toBe("mammoth");
  });
});
