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
          <ul className="tax-tree" role="tree" aria-label="Animalia taxonomic hierarchy">
            <TreeNode
              node={tree}
              expanded={expanded}
              flashId={flashId}
              lastMrcaId={last?.mrcaId ?? null}
              isRoot
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
  expanded,
  flashId,
  lastMrcaId,
  isRoot = false,
  onToggle,
}: {
  node: TreeNodeView;
  expanded: Set<number>;
  flashId: number | null;
  lastMrcaId: number | null;
  isRoot?: boolean;
  onToggle: (id: number) => void;
}) {
  const canExpand = node.expandable;
  const isOpen = expanded.has(node.taxon.id) || node.status === "constraint";
  const flashing = flashId === node.taxon.id;
  const shared = lastMrcaId === node.taxon.id;
  const isGenus = node.taxon.rank === "genus";

  const classes = [
    "tax-node",
    `is-${node.status}`,
    isRoot ? "is-root" : "",
    isOpen ? "is-open" : "",
    flashing ? "is-flash" : "",
    shared ? "is-shared" : "",
    isGenus ? "is-genus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={classes}
      role="treeitem"
      aria-selected={node.status === "constraint"}
      aria-expanded={canExpand ? isOpen : undefined}
    >
      {canExpand ? (
        <button
          type="button"
          className="tax-item"
          onClick={() => onToggle(node.taxon.id)}
        >
          <span className="tax-twist" aria-hidden="true">
            {isOpen ? "−" : "+"}
          </span>
          {node.skipped ? <span className="tax-skip">⋯</span> : null}
          <span className="tax-name">{node.taxon.name}</span>
        </button>
      ) : (
        <div className="tax-item">
          <span className="tax-twist is-leaf" aria-hidden="true" />
          {node.skipped ? <span className="tax-skip">⋯</span> : null}
          <span className="tax-name">{node.taxon.name}</span>
        </div>
      )}
      {isOpen && node.children.length > 0 && (
        <ul className="tax-kids" role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.taxon.id}
              node={child}
              expanded={expanded}
              flashId={flashId}
              lastMrcaId={lastMrcaId}
              onToggle={onToggle}
            />
          ))}
          {node.overflow ? (
            <li className="tax-overflow">{node.overflow} more</li>
          ) : null}
        </ul>
      )}
    </li>
  );
}

function TreeSkeleton() {
  return (
    <ul className="tax-tree is-loading" aria-hidden="true">
      <li className="tax-node is-constraint is-root is-open">
        <div className="tax-item">
          <span className="tax-twist">−</span>
          <span className="tax-name">Animalia</span>
        </div>
        <ul className="tax-kids">
          <li className="tax-node is-remaining">
            <div className="tax-item">
              <span className="tax-twist is-leaf" />
              <span className="tax-name">Porifera</span>
            </div>
          </li>
          <li className="tax-node is-remaining">
            <div className="tax-item">
              <span className="tax-twist">+</span>
              <span className="tax-name">Cnidaria</span>
            </div>
          </li>
          <li className="tax-node is-remaining is-open">
            <div className="tax-item">
              <span className="tax-twist">−</span>
              <span className="tax-name">Bilateria</span>
            </div>
            <ul className="tax-kids">
              <li className="tax-node is-remaining">
                <div className="tax-item">
                  <span className="tax-twist is-leaf" />
                  <span className="tax-name">Loading branches…</span>
                </div>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  );
}
