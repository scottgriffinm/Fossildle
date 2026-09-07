import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { Taxon, TaxonomyData } from "./types";
import {
  autoExpandIds,
  buildCabinetTree,
  expandBranchIds,
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

function allNames(root: ReturnType<typeof buildCabinetTree>): string[] {
  const out: string[] = [];
  const walk = (node: ReturnType<typeof buildCabinetTree>) => {
    out.push(node.taxon.name);
    node.children.forEach(walk);
  };
  walk(root);
  return out;
}

function allStatuses(root: ReturnType<typeof buildCabinetTree>): string[] {
  const out: string[] = [];
  const walk = (node: ReturnType<typeof buildCabinetTree>) => {
    out.push(node.status);
    node.children.forEach(walk);
  };
  walk(root);
  return out;
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

    const tree = buildCabinetTree(tax, open);
    expect(tree.taxon.name).toBe("Animalia");
    expect(tree.status).toBe("constraint");
    expect(tree.expandable).toBe(true);
    expect(names(tree.children).sort()).toEqual(["Arthropoda", "Chordata"]);
    expect(findNode(tree, "Chordata")?.expandable).toBe(true);
    expect(findNode(tree, "Chordata")?.children).toEqual([]);
    expect(findNode(tree, "Dinosauria")).toBeNull();
    expect(findNode(tree, "Arthropoda")).toBeTruthy();
  });

  it("reveals a collapsed clade's remaining children when that node is expanded", () => {
    const open = tax.pruneRemaining(5, []);
    const tree = buildCabinetTree(tax, open);
    const chordata = findNode(tree, "Chordata");
    expect(chordata?.expandable).toBe(true);

    const opened = buildCabinetTree(tax, open, {
      expandedIds: [
        ...autoExpandIds(tax, open),
        ...expandBranchIds(tax, open, chordata!.taxon.id),
      ],
    });
    expect(findNode(opened, "Dinosauria")).toBeTruthy();
    expect(findNode(opened, "Mammalia")).toBeTruthy();
    expect(findNode(opened, "Arthropoda")?.children).toEqual([]);
  });

  it("deletes a pruned clade from the rendered tree after a miss", () => {
    const after = tax.pruneRemaining(5, [13]);
    const branches = viewChildren(tax, after, 1);
    expect(names(branches)).toEqual(["Chordata"]);
    expect(branches.find((row) => row.taxon.name === "Arthropoda")).toBeUndefined();

    const tree = buildCabinetTree(tax, after);
    expect(tree.taxon.name).toBe("Animalia");
    expect(findNode(tree, "Arthropoda")).toBeNull();
    expect(findNode(tree, "Phacops")).toBeNull();
    expect(findNode(tree, "Chordata")?.status).toBe("remaining");
    expect(allStatuses(tree).every((status) => status !== "pruned" && status !== "outside")).toBe(
      true,
    );
  });

  it("roots the visible tree at the shared clade and drops pruned children", () => {
    const after = tax.pruneRemaining(5, [13, 7]);
    const tree = buildCabinetTree(tax, after);
    expect(tree.taxon.name).toBe("Dinosauria");
    expect(tree.status).toBe("constraint");
    expect(findNode(tree, "Animalia")).toBeNull();
    expect(findNode(tree, "Ornithischia")).toBeNull();
    expect(findNode(tree, "Triceratops")).toBeNull();
    expect(names(tree.children)).toEqual(expect.arrayContaining(["Theropoda", "Saurischia"]));
    expect(findNode(tree, "Theropoda")?.status).toBe("remaining");
  });

  it("shows the path to the answer after a win", () => {
    const won = tax.pruneRemaining(5, [13, 5]);
    const tree = buildCabinetTree(tax, won, { revealId: 5 });
    expect(allNames(tree)).toEqual(["Animalia", "Chordata", "Dinosauria", "Theropoda", "Tyrannosaurus"]);
    expect(tree.children).toHaveLength(1);
    expect(findNode(tree, "Arthropoda")).toBeNull();
    expect(findNode(tree, "Tyrannosaurus")?.taxon.rank).toBe("genus");
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

  it("opens on the Animalia crown, collapsed to about three levels", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const auto = autoExpandIds(tax, open);
    expect(tree.taxon.name).toBe("Animalia");
    expect(tree.status).toBe("constraint");
    expect(names(tree.children)).toEqual(
      expect.arrayContaining(["Porifera", "Cnidaria", "Bilateria"]),
    );
    expect(findNode(tree, "Bilateria")).toBeTruthy();
    expect(findNode(tree, "Eubilateria")).toBeTruthy();
    expect(findNode(tree, "Deuterostomia")).toBeTruthy();
    expect(findNode(tree, "Protostomia")).toBeTruthy();
    expect(findNode(tree, "Chordata")).toBeTruthy();
    expect(findNode(tree, "Arthropoda")).toBeTruthy();
    expect(findNode(tree, "Mollusca")).toBeTruthy();
    expect(tree.children.length).toBeGreaterThanOrEqual(3);
    expect(findNode(tree, "Cnidaria")?.expandable).toBe(true);
    expect(findNode(tree, "Cnidaria")?.children).toEqual([]);
    expect(findNode(tree, "Chordata")?.expandable).toBe(true);
    expect(findNode(tree, "Chordata")?.children).toEqual([]);
    expect(findNode(tree, "Anthozoa")).toBeNull();
    expect(findNode(tree, "Dinosauria")).toBeNull();
    expect(findNode(tree, "Ecdysozoa")).toBeNull();
    expect(findNode(tree, "Panarthropoda")).toBeNull();
    expect(findNode(tree, "Opabiniidae")).toBeNull();
    expect(auto).toEqual(expect.arrayContaining([tree.taxon.id]));
    const rendered = allNames(tree);
    expect(rendered.length).toBeGreaterThanOrEqual(10);
    expect(rendered.length).toBeLessThan(48);
  });

  it("expands a remaining crown branch on request and keeps siblings collapsed", () => {
    const open = tax.pruneRemaining(answer, []);
    const tree = buildCabinetTree(tax, open);
    const chordata = findNode(tree, "Chordata");
    expect(chordata?.expandable).toBe(true);

    const opened = buildCabinetTree(tax, open, {
      expandedIds: [
        ...autoExpandIds(tax, open),
        ...expandBranchIds(tax, open, chordata!.taxon.id),
      ],
    });
    expect(names(findNode(opened, "Chordata")!.children)).toEqual(["Vertebrata"]);
    expect(findNode(opened, "Vertebrata")?.status).toBe("remaining");
    expect(findNode(opened, "Gnathostomata")).toBeTruthy();
    expect(names(findNode(opened, "Gnathostomata")!.children)).toEqual(
      expect.arrayContaining(["Osteichthyes", "Placodermi", "Chondrichthyes"]),
    );
    expect(findNode(opened, "Dinosauria")).toBeNull();
    expect(findNode(opened, "Anthozoa")).toBeNull();
    expect(findNode(opened, "Arthropoda")?.children).toEqual([]);
    expect(findNode(opened, "Opabiniidae")).toBeNull();
  });

  it("keeps only the Eubilateria surviving branch after an arthropod miss", () => {
    const after = tax.pruneRemaining(answer, [phacops]);
    expect(tax.require(after.constraintId).name).toBe("Eubilateria");
    const tree = buildCabinetTree(tax, after);
    expect(tree.taxon.name).toBe("Eubilateria");
    expect(tree.status).toBe("constraint");
    expect(findNode(tree, "Protostomia")).toBeNull();
    expect(findNode(tree, "Arthropoda")).toBeNull();
    expect(findNode(tree, "Phacops")).toBeNull();
    expect(findNode(tree, "Porifera")).toBeNull();
    expect(findNode(tree, "Cnidaria")).toBeNull();
    expect(findNode(tree, "Animalia")).toBeNull();
    expect(findNode(tree, "Deuterostomia")?.status).toBe("remaining");
    expect(findNode(tree, "Chordata")?.status).toBe("remaining");
    expect(findNode(tree, "Chordata")?.expandable).toBe(true);
    expect(allStatuses(tree).every((status) => status !== "pruned" && status !== "outside")).toBe(
      true,
    );

    const chordata = findNode(tree, "Chordata")!;
    const opened = buildCabinetTree(tax, after, {
      expandedIds: [
        ...autoExpandIds(tax, after),
        ...expandBranchIds(tax, after, chordata.taxon.id),
      ],
    });
    expect(findNode(opened, "Arthropoda")).toBeNull();
    expect(findNode(opened, "Phacops")).toBeNull();
    expect(findNode(opened, "Protostomia")).toBeNull();
    expect(findNode(opened, "Gnathostomata")).toBeTruthy();
    expect(findNode(opened, "Dinosauria")).toBeNull();
    expect(names(findNode(opened, "Chordata")!.children)).toEqual(["Vertebrata"]);
    expect(findNode(opened, "Vertebrata")?.status).toBe("remaining");
  });

  it("roots at Dinosauria after a close miss and deletes Ornithischia", () => {
    const after = tax.pruneRemaining(answer, [phacops, triceratops]);
    expect(tax.require(after.constraintId).name).toBe("Dinosauria");
    const tree = buildCabinetTree(tax, after);
    expect(tree.taxon.name).toBe("Dinosauria");
    expect(tree.status).toBe("constraint");
    expect(tree.children.length).toBeGreaterThan(0);
    expect(findNode(tree, "Animalia")).toBeNull();
    expect(findNode(tree, "Protostomia")).toBeNull();
    expect(findNode(tree, "Ornithischia")).toBeNull();
    expect(findNode(tree, "Triceratops")).toBeNull();
    expect(findNode(tree, "Porifera")).toBeNull();
    expect(findNode(tree, "Cnidaria")).toBeNull();
    expect(findNode(tree, "Theropoda")?.status).toBe("remaining");
    const rendered = allNames(tree);
    expect(rendered.length).toBeLessThan(80);
    expect(allStatuses(tree).every((status) => status !== "pruned" && status !== "outside")).toBe(
      true,
    );
  });

  it("deletes leftovers after Phacops then Triceratops against Mammuthus", () => {
    const mammoth = parsePbdbOid("txn:43266");
    const after = tax.pruneRemaining(mammoth, [phacops, triceratops]);
    expect(tax.require(after.constraintId).name).toBe("Amniota");
    const tree = buildCabinetTree(tax, after);
    const rendered = allNames(tree);
    expect(tree.taxon.name).toBe("Amniota");
    expect(tree.status).toBe("constraint");
    expect(rendered).not.toEqual(expect.arrayContaining([
      "Animalia",
      "Porifera",
      "Cnidaria",
      "Eumetazoa",
      "Protostomia",
      "Ambulacraria",
      "Sauropsida",
      "Phacops",
      "Triceratops",
    ]));
    expect(rendered.some((name) => name.includes("⋯") || name === "…")).toBe(false);
    expect(findNode(tree, "Synapsida")?.status).toBe("remaining");
    expect(allStatuses(tree).every((status) => status !== "pruned" && status !== "outside")).toBe(
      true,
    );
    expect(JSON.stringify(tree)).not.toContain("skipped");
    expect(tree.children.length).toBeGreaterThan(0);
    expect(rendered.length).toBeGreaterThanOrEqual(2);
    expect(rendered.length).toBeLessThan(40);
  });

  it("reveals a clean path to Tyrannosaurus after a win", () => {
    const won = tax.pruneRemaining(answer, [phacops, answer]);
    const tree = buildCabinetTree(tax, won, { revealId: answer });
    expect(tree.taxon.name).toBe("Eubilateria");
    expect(allNames(tree).at(-1)).toBe("Tyrannosaurus");
    expect(findNode(tree, "Protostomia")).toBeNull();
    expect(findNode(tree, "Phacops")).toBeNull();
    expect(tree.children).toHaveLength(1);
    expect(findNode(tree, "Tyrannosaurus")?.children).toEqual([]);
  });
});
