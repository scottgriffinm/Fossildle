import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { TaxonomyData } from "./types";
import { buildCabinetTree } from "./tree-view";
import {
  DEFAULT_METRICS,
  childOriginX,
  fitScale,
  layoutCladogram,
  parentElbowX,
} from "./cladogram-layout";

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
    expect(layout.width).toBeLessThan(360);
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

  it("draws a continuous parent→child L from the right of each name, not a child-side rail", () => {
    const open = tax.pruneRemaining(answer, []);
    const layout = layoutCladogram(buildCabinetTree(tax, open));
    const parents = layout.nodes.filter((node) => node.children.length > 0);
    expect(parents.length).toBeGreaterThan(0);

    for (const parent of parents) {
      const elbowX = parentElbowX(parent.inkRight);
      const childX = childOriginX(parent.inkRight);

      expect(elbowX).toBeGreaterThan(parent.inkRight);
      expect(childX - elbowX).toBe(DEFAULT_METRICS.twig);
      expect(DEFAULT_METRICS.twig).toBeGreaterThanOrEqual(16);
      expect(elbowX - parent.inkRight).toBe(DEFAULT_METRICS.stem);
      expect(DEFAULT_METRICS.stem).toBeLessThan(DEFAULT_METRICS.twig);

      for (const child of parent.children) {
        expect(child.x).toBe(childX);
        expect(child.x).toBeGreaterThan(elbowX);

        const branch = layout.edges.find(
          (edge) =>
            edge.kind === "branch" &&
            edge.d.startsWith(`M ${parent.inkRight.toFixed(2)} ${parent.y.toFixed(2)}`) &&
            edge.d.endsWith(`L ${child.x.toFixed(2)} ${child.y.toFixed(2)}`),
        );
        expect(branch).toBeTruthy();

        if (Math.abs(child.y - parent.y) >= 0.5) {
          expect(branch!.d).toContain(`L ${elbowX.toFixed(2)} ${parent.y.toFixed(2)}`);
          expect(branch!.d).toContain(`L ${elbowX.toFixed(2)} ${child.y.toFixed(2)}`);
        }
      }
    }
  });

  it("does not park child labels on the sibling bar (the old tick-mark geometry)", () => {
    const open = tax.pruneRemaining(answer, []);
    const layout = layoutCladogram(buildCabinetTree(tax, open));
    const animalia = layout.nodes.find((node) => node.name === "Animalia");
    expect(animalia).toBeTruthy();
    const porifera = animalia!.children.find((child) => child.name === "Porifera");
    expect(porifera).toBeTruthy();

    const elbowX = parentElbowX(animalia!.inkRight);
    expect(porifera!.x - elbowX).toBeGreaterThanOrEqual(16);
    expect(animalia!.inkRight).toBeLessThan(animalia!.x + animalia!.labelWidth);
    expect(animalia!.x).toBe(DEFAULT_METRICS.rootStem);

    const rootTail = layout.edges.find(
      (edge) => edge.d === `M 0.00 ${animalia!.y.toFixed(2)} L ${animalia!.x.toFixed(2)} ${animalia!.y.toFixed(2)}`,
    );
    expect(rootTail).toBeTruthy();
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

    // Header + taller fossil + composer leave ~332×360 for the shorter tree panel.
    const scale = fitScale(layout.width, layout.height, 332, 360, { min: 0.62, pad: 4 });
    expect(scale).toBeGreaterThanOrEqual(0.82);
    expect(layout.width * scale).toBeLessThanOrEqual(332);
    expect(layout.height * scale).toBeLessThanOrEqual(360);
  });

  it("uses measured ink widths so stems leave the real right edge of each name", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const guessed = layoutCladogram(tree);
    const animalia = guessed.nodes.find((node) => node.name === "Animalia")!;
    const measured = new Map<number, number>([[animalia.id, animalia.inkRight - animalia.x + 12]]);
    const laid = layoutCladogram(tree, DEFAULT_METRICS, measured);
    const next = laid.nodes.find((node) => node.id === animalia.id)!;
    expect(next.inkRight - next.x).toBe(animalia.inkRight - animalia.x + 12);
    expect(next.children[0]!.x).toBeGreaterThan(animalia.children[0]!.x);
  });

  it("does not invent extra vertical space beyond packed leaves", () => {
    const scale = fitScale(8000, 8000, 332, 400, { min: 0.62, pad: 0 });
    expect(scale).toBe(0.62);
    expect(fitScale(200, 200, 332, 400)).toBe(1);
  });
});
