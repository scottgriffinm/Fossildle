import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { TaxonomyData } from "./types";
import { buildCabinetTree } from "./tree-view";
import { DEFAULT_METRICS, fitScale, layoutCladogram } from "./cladogram-layout";

describe("packed LTR cladogram layout", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");

  it("packs each remaining leaf on its own row and sits parents on leaf midpoints", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const layout = layoutCladogram(tree);

    expect(layout.leafCount).toBeGreaterThanOrEqual(8);
    expect(layout.leafCount).toBeLessThan(28);
    expect(layout.height).toBe(layout.leafCount * DEFAULT_METRICS.rowHeight);
    expect(layout.height).toBeLessThan(400);
    expect(layout.width).toBeLessThan(340);
    expect(layout.depth).toBeLessThan(6);

    const byName = new Map(layout.nodes.map((node) => [node.name, node]));
    const animalia = byName.get("Animalia");
    const porifera = byName.get("Porifera");
    const chordata = byName.get("Chordata");
    const arthropoda = byName.get("Arthropoda");
    expect(animalia).toBeTruthy();
    expect(porifera).toBeTruthy();
    expect(chordata).toBeTruthy();
    expect(arthropoda).toBeTruthy();

    expect(Math.abs(porifera!.y - animalia!.y)).toBeLessThan(200);
    expect(Math.abs(chordata!.y - porifera!.y)).toBeLessThan(360);
    expect(arthropoda!.x).toBeGreaterThan(animalia!.x);
    expect(layout.nodes.some((node) => node.name === "Bilateria")).toBe(false);

    const first = animalia!.children[0]!;
    const last = animalia!.children[animalia!.children.length - 1]!;
    expect(animalia!.y).toBeCloseTo((first.y + last.y) / 2, 5);
  });

  it("fits the opening Animalia radiation in a 390×844 tree panel without shrinking below readable", () => {
    const open = tax.pruneRemaining(answer, []);
    const layout = layoutCladogram(buildCabinetTree(tax, open));
    const names = new Set(layout.nodes.map((node) => node.name));
    expect([...names]).toEqual(
      expect.arrayContaining([
        "Porifera",
        "Cnidaria",
        "Arthropoda",
        "Mollusca",
        "Chordata",
        "Echinodermata",
      ]),
    );

    // Header + fossil + composer leave ~400×332 for the tree on a 390×844 phone.
    const scale = fitScale(layout.width, layout.height, 332, 400, { min: 0.62, pad: 4 });
    expect(scale).toBeGreaterThanOrEqual(0.85);
    expect(layout.width * scale).toBeLessThanOrEqual(332);
    expect(layout.height * scale).toBeLessThanOrEqual(400);
  });

  it("does not invent extra vertical space beyond packed leaves", () => {
    const scale = fitScale(8000, 8000, 332, 400, { min: 0.62, pad: 0 });
    expect(scale).toBe(0.62);
    expect(fitScale(200, 200, 332, 400)).toBe(1);
  });
});
