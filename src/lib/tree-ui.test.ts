import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("play UI tree", () => {
  it("renders a nested HTML outline, not a packed LTR cladogram", () => {
    const tree = readFileSync(path.join(process.cwd(), "src/components/TaxonomyTree.tsx"), "utf8");
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(tree).toContain('className="tax-tree"');
    expect(tree).toContain('className="tax-kids"');
    expect(tree).toContain('data-tree-engine="nested-outline"');
    expect(tree).not.toMatch(/cladogram-layout/);
    expect(tree).not.toMatch(/layoutCladogram/);
    expect(tree).not.toMatch(/<svg/);
    expect(css).toContain(".tax-kids > .tax-node::before");
    expect(css).toContain(".tax-kids > .tax-node::after");
    expect(css).not.toMatch(/\.cladogram\b/);
    expect(pkg.dependencies?.["d3-hierarchy"]).toBeUndefined();
    expect(pkg.dependencies?.["d3-shape"]).toBeUndefined();
  });
});
