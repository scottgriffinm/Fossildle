import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { TaxonomyData } from "./types";
import type { TreeNodeView } from "./tree-view";
import { buildCabinetTree } from "./tree-view";
import {
  DEFAULT_METRICS,
  FIT_MIN,
  cladogramLink,
  fitScale,
  labelIsAttached,
  layoutCladogram,
} from "./cladogram-layout";

function miniTree(): TreeNodeView {
  return {
    taxon: { id: 1, name: "Animalia", rank: "kingdom", parentId: null },
    status: "constraint",
    genusCount: 3,
    expandable: true,
    children: [
      {
        taxon: { id: 2, name: "Porifera", rank: "phylum", parentId: 1 },
        status: "remaining",
        genusCount: 1,
        expandable: false,
        children: [],
      },
      {
        taxon: { id: 3, name: "Chordata", rank: "phylum", parentId: 1 },
        status: "remaining",
        genusCount: 2,
        expandable: true,
        children: [
          {
            taxon: { id: 4, name: "Mammalia", rank: "class", parentId: 3 },
            status: "remaining",
            genusCount: 1,
            expandable: false,
            children: [],
          },
          {
            taxon: { id: 5, name: "Dinosauria", rank: "unranked", parentId: 3 },
            status: "remaining",
            genusCount: 1,
            expandable: false,
            children: [],
          },
        ],
      },
    ],
  };
}

describe("phylotree.js curveStepBefore rectangular cladogram", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");

  it("uses phylotree step-before elbows; internals above the branch, tips on the tip", () => {
    const layout = layoutCladogram(miniTree());
    expect(layout.engine).toBe("phylotree-curveStepBefore");
    expect(layout.links).toHaveLength(4);
    expect(layout.stem.d.startsWith("M")).toBe(true);
    expect(layout.stem.d.includes("C")).toBe(false);

    const byName = new Map(layout.nodes.map((node) => [node.name, node]));
    const animalia = byName.get("Animalia")!;
    const porifera = byName.get("Porifera")!;
    const chordata = byName.get("Chordata")!;
    const mammalia = byName.get("Mammalia")!;

    expect(animalia.isTip).toBe(false);
    expect(chordata.isTip).toBe(false);
    expect(porifera.isTip).toBe(true);
    expect(mammalia.isTip).toBe(true);

    expect(porifera.x).toBeGreaterThan(animalia.x);
    expect(chordata.x).toBe(porifera.x);
    expect(mammalia.x).toBeGreaterThan(chordata.x);
    expect(animalia.y).toBeGreaterThan(porifera.y);
    expect(animalia.y).toBeLessThan(chordata.y);

    expect(animalia.labelY).toBeLessThan(animalia.y);
    expect(chordata.labelY).toBeLessThan(chordata.y);
    expect(porifera.labelX).toBeGreaterThanOrEqual(porifera.x);
    expect(porifera.labelX).toBeLessThanOrEqual(porifera.x + DEFAULT_METRICS.tipGap + 1);

    for (const node of layout.nodes) {
      expect(labelIsAttached(node)).toBe(true);
    }
  });

  it("draws one continuous parent→child step from node joins — never from the right of a label box", () => {
    const layout = layoutCladogram(miniTree());
    const chordata = layout.nodes.find((node) => node.name === "Chordata")!;
    const mammalia = layout.nodes.find((node) => node.name === "Mammalia")!;
    const link = layout.links.find(
      (edge) => edge.parentId === chordata.id && edge.childId === mammalia.id,
    )!;

    expect(link.source).toEqual([chordata.x, chordata.y]);
    expect(link.target).toEqual([mammalia.x, mammalia.y]);
    expect(link.d).toBe(cladogramLink(link.source, link.target));
    expect(link.d.includes("C")).toBe(false);
    expect(link.source[0]).toBe(chordata.x);

    expect(mammalia.incomingX).toBe(chordata.x);
    expect(mammalia.labelX).toBeGreaterThanOrEqual(mammalia.x);
  });

  it("lays out the remaining Animalia crown with cluster midpoints and no wrapper spine", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const layout = layoutCladogram(tree);

    expect(layout.engine).toBe("phylotree-curveStepBefore");
    expect(layout.leafCount).toBeGreaterThanOrEqual(8);
    expect(layout.leafCount).toBeLessThan(28);
    expect(layout.height).toBeLessThan(430);
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

    expect(porifera!.x).toBeGreaterThan(animalia!.x);
    expect(arthropoda!.x).toBeGreaterThan(animalia!.x);
    expect(layout.nodes.some((node) => node.name === "Bilateria")).toBe(false);

    const first = animalia!.children[0]!;
    const last = animalia!.children[animalia!.children.length - 1]!;
    expect(animalia!.y).toBeGreaterThan(first.y);
    expect(animalia!.y).toBeLessThan(last.y);
    expect(Math.abs(porifera!.y - animalia!.y)).toBeLessThan(220);

    expect(animalia!.isTip).toBe(false);
    expect(animalia!.labelY).toBeLessThan(animalia!.y);
    expect(porifera!.isTip).toBe(true);
    expect(porifera!.labelX).toBeGreaterThanOrEqual(porifera!.x);

    for (const node of layout.nodes) {
      expect(labelIsAttached(node)).toBe(true);
    }
  });

  it("connects every parent join to every child join with a step-before path", () => {
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
        expect(link!.source).toEqual([parent.x, parent.y]);
        expect(link!.target).toEqual([child.x, child.y]);
        expect(link!.d).toBe(cladogramLink(link!.source, link!.target));
        expect(link!.d.startsWith("M")).toBe(true);
        expect(link!.d.includes("C")).toBe(false);
        expect(link!.source[0]).toBe(parent.x);
        expect(link!.target[0]).toBe(child.x);
        expect(link!.target[1]).toBeCloseTo(child.y, 5);
        expect(child.incomingX).toBe(parent.x);
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

    const scale = fitScale(layout.width, layout.height, 332, 360, { min: FIT_MIN, pad: 4 });
    expect(scale).toBeGreaterThanOrEqual(FIT_MIN);
    expect(layout.width * scale).toBeLessThanOrEqual(332);
    expect(layout.height * scale).toBeLessThanOrEqual(360);

    for (const node of layout.nodes) {
      if (!node.isTip) continue;
      expect(node.labelX + node.labelWidth).toBeLessThanOrEqual(layout.width);
      expect(node.name.length).toBeGreaterThan(1);
    }
    const tips = layout.nodes.filter((node) => node.isTip).map((node) => node.name);
    expect(tips).toEqual(
      expect.arrayContaining(["Trilobita", "Bivalvia", "Gastropoda", "Ammonoidea"]),
    );
  });

  it("does not invent extra vertical space beyond packed leaves", () => {
    const scale = fitScale(8000, 8000, 332, 400, { min: FIT_MIN, pad: 0 });
    expect(scale).toBe(FIT_MIN);
    expect(fitScale(200, 200, 332, 400)).toBe(1);
    expect(DEFAULT_METRICS.rowHeight).toBeGreaterThan(12);
    expect(DEFAULT_METRICS.fontSize).toBeLessThanOrEqual(10);
    expect(DEFAULT_METRICS.labelLift).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_METRICS.tipGap).toBeLessThanOrEqual(5);
    expect(DEFAULT_METRICS.branchMin).toBeLessThanOrEqual(28);
  });
});
