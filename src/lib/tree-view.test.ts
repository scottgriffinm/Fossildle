import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { Taxon, TaxonomyData } from "./types";
import {
  autoExpandIds,
  buildCabinetTree,
  nodeStatus,
  viewChildren,
} from "./tree-view";

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

function names(nodes: { taxon: Taxon }[]): string[] {
  return nodes.map((node) => node.taxon.name);
}

function findNode(
  root: ReturnType<typeof buildCabinetTree>,
  name: string,
): ReturnType<typeof buildCabinetTree> | null {
  if (root.taxon.name === name) return root;
  for (const child of root.children) {
    const hit = findNode(child, name);
    if (hit) return hit;
  }
  return null;
}

describe("cabinet tree view", () => {
  const tax = new TaxonomyIndex(fixture());

  it("marks lineage, remaining, pruned, and outside nodes", () => {
    const open = tax.pruneRemaining(5, []);
    expect(nodeStatus(tax, 1, open)).toBe("constraint");
    expect(nodeStatus(tax, 2, open)).toBe("remaining");
    expect(nodeStatus(tax, 12, open)).toBe("remaining");

    const afterArthropod = tax.pruneRemaining(5, [13]);
    expect(nodeStatus(tax, 1, afterArthropod)).toBe("constraint");
    expect(nodeStatus(tax, 12, afterArthropod)).toBe("pruned");
    expect(nodeStatus(tax, 13, afterArthropod)).toBe("pruned");
    expect(nodeStatus(tax, 2, afterArthropod)).toBe("remaining");

    const afterTrike = tax.pruneRemaining(5, [13, 7]);
    expect(nodeStatus(tax, 3, afterTrike)).toBe("constraint");
    expect(nodeStatus(tax, 1, afterTrike)).toBe("lineage");
    expect(nodeStatus(tax, 2, afterTrike)).toBe("lineage");
    expect(nodeStatus(tax, 6, afterTrike)).toBe("pruned");
    expect(nodeStatus(tax, 10, afterTrike)).toBe("outside");
    expect(nodeStatus(tax, 4, afterTrike)).toBe("remaining");
  });

  it("shows Animalia children as a real tree before any guess", () => {
    const open = tax.pruneRemaining(5, []);
    const branches = viewChildren(tax, open, 1);
    expect(names(branches).sort()).toEqual(["Arthropoda", "Chordata"]);
    expect(branches.every((row) => row.status === "remaining")).toBe(true);

    const tree = buildCabinetTree(tax, open, autoExpandIds(tax, open));
    expect(tree.taxon.name).toBe("Animalia");
    expect(tree.status).toBe("constraint");
    expect(names(tree.children).sort()).toEqual(["Arthropoda", "Chordata"]);
    expect(findNode(tree, "Chordata")).toBeTruthy();
    expect(findNode(tree, "Arthropoda")).toBeTruthy();
  });

  it("keeps pruned branches visible and greyable after a miss", () => {
    const after = tax.pruneRemaining(5, [13]);
    const branches = viewChildren(tax, after, 1);
    const arthropoda = branches.find((row) => row.taxon.name === "Arthropoda");
    const chordata = branches.find((row) => row.taxon.name === "Chordata");
    expect(arthropoda?.status).toBe("pruned");
    expect(chordata?.status).toBe("remaining");

    const tree = buildCabinetTree(tax, after, autoExpandIds(tax, after));
    expect(findNode(tree, "Arthropoda")?.status).toBe("pruned");
    expect(findNode(tree, "Chordata")?.status).toBe("remaining");
  });

  it("focuses the shared clade and shows its living and pruned children", () => {
    const after = tax.pruneRemaining(5, [13, 7]);
    const tree = buildCabinetTree(tax, after, autoExpandIds(tax, after));
    const dino = findNode(tree, "Dinosauria");
    expect(dino?.status).toBe("constraint");
    expect(dino).toBeTruthy();
    const childNames = names(dino!.children);
    expect(childNames).toEqual(expect.arrayContaining(["Theropoda", "Saurischia", "Ornithischia"]));
    expect(findNode(dino!, "Ornithischia")?.status).toBe("pruned");
    expect(findNode(dino!, "Theropoda")?.status).toBe("remaining");
  });
});

describe("cabinet tree on the shipped Animalia artifact", () => {
  const data = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
  ) as TaxonomyData;
  const tax = new TaxonomyIndex(data);
  const answer = parsePbdbOid("txn:38613");
  const phacops = parsePbdbOid("txn:21701");
  const triceratops = parsePbdbOid("txn:38862");

  it("opens on a branching Animalia tree before any guess", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open, autoExpandIds(tax, open));
    expect(tree.taxon.name).toBe("Animalia");
    expect(tree.status).toBe("constraint");
    expect(findNode(tree, "Bilateria")).toBeTruthy();
    expect(findNode(tree, "Eubilateria")).toBeTruthy();
    expect(findNode(tree, "Deuterostomia")).toBeTruthy();
    expect(findNode(tree, "Protostomia")).toBeTruthy();
    expect(tree.children.length).toBeGreaterThanOrEqual(1);
  });

  it("greys Protostomia in place after an arthropod miss", () => {
    const after = tax.pruneRemaining(answer, [phacops]);
    expect(tax.require(after.constraintId).name).toBe("Eubilateria");
    const tree = buildCabinetTree(tax, after, autoExpandIds(tax, after));
    expect(findNode(tree, "Eubilateria")?.status).toBe("constraint");
    expect(findNode(tree, "Protostomia")?.status).toBe("pruned");
    expect(findNode(tree, "Deuterostomia")?.status).toBe("remaining");
    expect(findNode(tree, "Porifera")).toBeNull();
    expect(findNode(tree, "Cnidaria")?.status).toBe("outside");
  });

  it("still shows a tree crown at Dinosauria after a close miss", () => {
    const after = tax.pruneRemaining(answer, [phacops, triceratops]);
    expect(tax.require(after.constraintId).name).toBe("Dinosauria");
    const tree = buildCabinetTree(tax, after, autoExpandIds(tax, after));
    expect(findNode(tree, "Animalia")?.status).toBe("lineage");
    const dino = findNode(tree, "Dinosauria");
    expect(dino?.status).toBe("constraint");
    expect(dino && dino.children.length).toBeGreaterThan(0);
    expect(findNode(tree, "Protostomia")?.status).toBe("pruned");
    expect(findNode(tree, "Chordata")).toBeTruthy();
    expect(findNode(tree, "Gnathostomata")).toBeNull();
    expect(findNode(tree, "Osteichthyes")).toBeNull();
    const allNames: string[] = [];
    const walk = (node: NonNullable<ReturnType<typeof findNode>>) => {
      allNames.push(node.taxon.name);
      node.children.forEach(walk);
    };
    walk(tree);
    expect(allNames.length).toBeLessThan(40);
  });
});
