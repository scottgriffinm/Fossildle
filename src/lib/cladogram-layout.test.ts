import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { TaxonomyData } from "./types";
import { buildCabinetTree } from "./tree-view";
import {
  DEFAULT_METRICS,
  cladogramLink,
  fitScale,
  layoutCladogram,
} from "./cladogram-layout";

describe("d3 cluster + linkHorizontal cladogram", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");

  it("lays out the remaining crown with cluster midpoints and one cubic per edge", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const layout = layoutCladogram(tree);

    expect(layout.engine).toBe("d3-cluster-linkHorizontal");
    expect(layout.leafCount).toBeGreaterThanOrEqual(8);
    expect(layout.leafCount).toBeLessThan(28);
    expect(layout.height).toBeLessThan(420);
    expect(layout.width).toBeLessThan(420);
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

    expect(porifera!.x).toBeGreaterThan(animalia!.x);
    expect(arthropoda!.x).toBeGreaterThan(animalia!.x);
    expect(layout.nodes.some((node) => node.name === "Bilateria")).toBe(false);

    const first = animalia!.children[0]!;
    const last = animalia!.children[animalia!.children.length - 1]!;
    expect(animalia!.y).toBeGreaterThan(first.y);
    expect(animalia!.y).toBeLessThan(last.y);
    expect(Math.abs(porifera!.y - animalia!.y)).toBeLessThan(220);
  });

  it("draws a real d3-shape linkHorizontal path from each parent to each child", () => {
    const open = tax.pruneRemaining(answer, []);
    const layout = layoutCladogram(buildCabinetTree(tax, open));
    const parents = layout.nodes.filter((node) => node.children.length > 0);
    expect(parents.length).toBeGreaterThan(0);
    expect(layout.links).toHaveLength(layout.nodes.length - 1);

    for (const parent of parents) {
      for (const child of parent.children) {
        const link = layout.links.find(
          (edge) => edge.parentId === parent.id && edge.childId === child.id,
        );
        expect(link).toBeTruthy();
        const expected = cladogramLink(link!.source, link!.target);
        expect(link!.d).toBe(expected);
        expect(link!.d.startsWith("M")).toBe(true);
        expect(link!.d.includes("C")).toBe(true);
        expect(link!.source[0]).toBeGreaterThan(parent.x);
        expect(link!.target[0]).toBe(child.x);
        expect(link!.target[1]).toBeCloseTo(child.y, 5);
      }
    }
  });

  it("fits the opening Animalia radiation in a 390×844 tree panel", () => {
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

    // Header + taller fossil + composer leave ~332×360 for the shorter tree panel.
    const scale = fitScale(layout.width, layout.height, 332, 360, { min: 0.62, pad: 4 });
    expect(scale).toBeGreaterThanOrEqual(0.72);
    expect(layout.width * scale).toBeLessThanOrEqual(332);
    expect(layout.height * scale).toBeLessThanOrEqual(360);
  });

  it("does not invent extra vertical space beyond packed leaves", () => {
    const scale = fitScale(8000, 8000, 332, 400, { min: 0.62, pad: 0 });
    expect(scale).toBe(0.62);
    expect(fitScale(200, 200, 332, 400)).toBe(1);
    expect(DEFAULT_METRICS.rowHeight).toBeGreaterThan(12);
  });
});
