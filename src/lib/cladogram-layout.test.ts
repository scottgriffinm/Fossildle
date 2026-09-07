import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { TaxonomyData } from "./types";
import { buildCabinetTree } from "./tree-view";
import {
  DEFAULT_METRICS,
  cladogramElbow,
  fitScale,
  layoutCladogram,
} from "./cladogram-layout";

describe("d3 cluster + orthogonal elbow cladogram", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");

  it("lays out the remaining crown with cluster midpoints and orthogonal elbows", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const layout = layoutCladogram(tree);

    expect(layout.engine).toBe("d3-cluster-elbow");
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

    expect(porifera!.x).toBeGreaterThan(animalia!.inkRight);
    expect(arthropoda!.x).toBeGreaterThan(animalia!.x);
    expect(layout.nodes.some((node) => node.name === "Bilateria")).toBe(false);

    const first = animalia!.children[0]!;
    const last = animalia!.children[animalia!.children.length - 1]!;
    expect(animalia!.y).toBeGreaterThan(first.y);
    expect(animalia!.y).toBeLessThan(last.y);
    expect(Math.abs(porifera!.y - animalia!.y)).toBeLessThan(220);
  });

  it("draws a parent→child L from the right of each name, not a short cubic spine", () => {
    const open = tax.pruneRemaining(answer, []);
    const layout = layoutCladogram(buildCabinetTree(tax, open));
    const parents = layout.nodes.filter((node) => node.children.length > 0);
    expect(parents.length).toBeGreaterThan(0);

    for (const parent of parents) {
      for (const child of parent.children) {
        const link = layout.links.find(
          (edge) => edge.parentId === parent.id && edge.childId === child.id,
        );
        expect(link).toBeTruthy();
        expect(link!.d).toBe(cladogramElbow(link!.source, link!.target, DEFAULT_METRICS.stem));
        expect(link!.d.includes("C")).toBe(false);
        expect(link!.source[0]).toBe(parent.inkRight);
        expect(link!.target[0]).toBe(child.x);
        expect(link!.elbowX).toBe(parent.inkRight + DEFAULT_METRICS.stem);
        expect(child.x - link!.elbowX).toBeGreaterThanOrEqual(DEFAULT_METRICS.twig - 0.5);
        expect(DEFAULT_METRICS.twig).toBeGreaterThan(DEFAULT_METRICS.stem);
      }
    }
  });

  it("does not park child joints on the sibling bar (the old tick-mark geometry)", () => {
    const open = tax.pruneRemaining(answer, []);
    const layout = layoutCladogram(buildCabinetTree(tax, open));
    const animalia = layout.nodes.find((node) => node.name === "Animalia")!;
    const porifera = animalia.children.find((child) => child.name === "Porifera")!;
    const link = layout.links.find(
      (edge) => edge.parentId === animalia.id && edge.childId === porifera.id,
    )!;
    expect(porifera.x - link.elbowX).toBeGreaterThanOrEqual(16);
    expect(link.source[0]).toBe(animalia.inkRight);
  });

  it("uses measured ink widths so stems leave the real right edge of each name", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const guessed = layoutCladogram(tree);
    const animalia = guessed.nodes.find((node) => node.name === "Animalia")!;
    const measured = new Map<number, number>([[animalia.id, 70]]);
    const laid = layoutCladogram(tree, DEFAULT_METRICS, measured);
    const next = laid.nodes.find((node) => node.id === animalia.id)!;
    expect(next.inkRight - next.x).toBe(DEFAULT_METRICS.labelOffset + 70);
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
