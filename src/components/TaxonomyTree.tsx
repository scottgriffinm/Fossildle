"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import {
  autoExpandIds,
  buildCabinetTree,
  type TreeNodeView,
} from "@/lib/tree-view";
import type { PruneState } from "@/lib/types";

export function TaxonomyTree({
  taxonomy,
  prune,
  loading = false,
}: {
  taxonomy: TaxonomyIndex | null;
  prune: PruneState | null;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [flashId, setFlashId] = useState<number | null>(null);
  const stepCount = prune?.steps.length ?? 0;
  const constraintId = prune?.constraintId;
  const last = prune?.steps.at(-1);

  useEffect(() => {
    if (!taxonomy || !prune) return;
    setExpanded(new Set(autoExpandIds(taxonomy, prune)));
  }, [taxonomy, prune, stepCount, constraintId]);

  useEffect(() => {
    if (last?.prunedId == null) return;
    setFlashId(last.prunedId);
    const timer = window.setTimeout(() => setFlashId(null), 1400);
    return () => window.clearTimeout(timer);
  }, [last?.prunedId, stepCount]);

  const tree = useMemo(() => {
    if (!taxonomy || !prune) return null;
    return buildCabinetTree(taxonomy, prune, expanded);
  }, [taxonomy, prune, expanded]);

  function toggle(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="panel tree-panel" aria-label="Taxonomic tree">
      <div className="tree-scroll">
        {loading || !tree || !taxonomy ? (
          <TreeSkeleton />
        ) : (
          <ul className="phylo-tree" role="tree" aria-label="Remaining Animalia tree">
            <TreeNode
              node={tree}
              taxonomy={taxonomy}
              expanded={expanded}
              flashId={flashId}
              lastMrcaId={last?.mrcaId ?? null}
              onToggle={toggle}
            />
          </ul>
        )}
      </div>
    </section>
  );
}

function TreeNode({
  node,
  taxonomy,
  expanded,
  flashId,
  lastMrcaId,
  onToggle,
}: {
  node: TreeNodeView;
  taxonomy: TaxonomyIndex;
  expanded: Set<number>;
  flashId: number | null;
  lastMrcaId: number | null;
  onToggle: (id: number) => void;
}) {
  const kids = taxonomy.children.get(node.taxon.id) ?? [];
  const canExpand =
    node.status !== "pruned" &&
    node.status !== "outside" &&
    kids.length > 0;
  const isOpen = expanded.has(node.taxon.id) || node.status === "constraint";
  const flashing = flashId === node.taxon.id;
  const shared = lastMrcaId === node.taxon.id;

  return (
    <li
      className={`phylo-node is-${node.status}${flashing ? " is-flash" : ""}${
        shared ? " is-shared" : ""
      }`}
      role="treeitem"
      aria-selected={node.status === "constraint"}
      aria-expanded={canExpand ? isOpen : undefined}
    >
      {node.skipped ? <div className="phylo-skip">⋯</div> : null}
      <button
        type="button"
        className="phylo-row"
        disabled={!canExpand}
        onClick={() => canExpand && onToggle(node.taxon.id)}
      >
        <span className="phylo-dot" aria-hidden="true" />
        <span className="phylo-name">{node.taxon.name}</span>
      </button>
      {isOpen && node.children.length > 0 && (
        <ul className="phylo-children" role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.taxon.id}
              node={child}
              taxonomy={taxonomy}
              expanded={expanded}
              flashId={flashId}
              lastMrcaId={lastMrcaId}
              onToggle={onToggle}
            />
          ))}
          {node.overflow ? (
            <li className="phylo-overflow">{node.overflow} more</li>
          ) : null}
        </ul>
      )}
    </li>
  );
}

function TreeSkeleton() {
  return (
    <ul className="phylo-tree is-loading" aria-hidden="true">
      <li className="phylo-node is-constraint">
        <div className="phylo-row">
          <span className="phylo-dot" />
          <span className="phylo-name">Animalia</span>
        </div>
        <ul className="phylo-children">
          <li className="phylo-node is-remaining">
            <div className="phylo-row">
              <span className="phylo-dot" />
              <span className="phylo-name">Bilateria</span>
            </div>
            <ul className="phylo-children">
              <li className="phylo-node is-remaining">
                <div className="phylo-row">
                  <span className="phylo-dot" />
                  <span className="phylo-name">Loading branches…</span>
                </div>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  );
}
