"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import {
  autoExpandIds,
  buildCabinetTree,
  expandBranchIds,
  type TreeNodeView,
} from "@/lib/tree-view";
import type { GameStatus, PruneState } from "@/lib/types";

export function TaxonomyTree({
  taxonomy,
  prune,
  status = "playing",
  answerId = null,
  loading = false,
}: {
  taxonomy: TaxonomyIndex | null;
  prune: PruneState | null;
  status?: GameStatus;
  answerId?: number | null;
  loading?: boolean;
}) {
  const [flashId, setFlashId] = useState<number | null>(null);
  const stepCount = prune?.steps.length ?? 0;
  const constraintId = prune?.constraintId;
  const pruneKey = `${constraintId ?? "none"}:${stepCount}`;

  const autoExpanded = useMemo(() => {
    if (!taxonomy || !prune || status === "won") return new Set<number>();
    return new Set(autoExpandIds(taxonomy, prune));
  }, [taxonomy, prune, status]);

  const [browseExpanded, setBrowseExpanded] = useState<Set<number> | null>(null);

  useEffect(() => {
    setBrowseExpanded(null);
  }, [pruneKey]);

  useEffect(() => {
    if (constraintId == null || stepCount === 0 || status !== "playing") return;
    setFlashId(constraintId);
    const timer = window.setTimeout(() => setFlashId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [constraintId, stepCount, status]);

  const expanded = browseExpanded ?? autoExpanded;

  const tree = useMemo(() => {
    if (!taxonomy || !prune) return null;
    return buildCabinetTree(taxonomy, prune, {
      revealId: status === "won" && answerId != null ? answerId : undefined,
      expandedIds: expanded,
    });
  }, [taxonomy, prune, status, answerId, expanded]);

  function toggle(id: number) {
    if (id === constraintId || !taxonomy || !prune) return;
    setBrowseExpanded((current) => {
      const next = new Set(current ?? autoExpanded);
      if (next.has(id)) {
        next.delete(id);
      } else {
        for (const extra of expandBranchIds(taxonomy, prune, id)) next.add(extra);
      }
      return next;
    });
  }

  return (
    <section className="tree-panel" aria-label="Taxonomic tree">
      <div className="tree-scroll">
        {loading || !tree || !taxonomy ? (
          <TreeSkeleton />
        ) : (
          <ul
            className="tax-tree"
            role="tree"
            aria-label="Remaining taxonomic hierarchy"
            data-tree-engine="nested-outline"
          >
            <TreeNode
              node={tree}
              depth={0}
              flashId={flashId}
              expanded={expanded}
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
  depth,
  flashId,
  expanded,
  isRoot = false,
  onToggle,
}: {
  node: TreeNodeView;
  depth: number;
  flashId: number | null;
  expanded: Set<number>;
  isRoot?: boolean;
  onToggle: (id: number) => void;
}) {
  const flashing = flashId === node.taxon.id;
  const isGenus = node.taxon.rank === "genus";
  const canExpand = node.expandable;
  const isOpen = !canExpand || expanded.has(node.taxon.id) || node.status === "constraint";
  const canToggle = canExpand && node.status !== "constraint";
  const showKids = isOpen && node.children.length > 0;

  const classes = [
    "tax-node",
    `is-${node.status}`,
    isRoot ? "is-root" : "",
    canExpand ? "is-expandable" : "",
    isOpen ? "is-open" : "",
    flashing ? "is-flash" : "",
    isGenus ? "is-genus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = (
    <span className="tax-name">
      {node.taxon.name}
      {canExpand && !isOpen ? <span className="tax-more"> ›</span> : null}
    </span>
  );

  return (
    <li
      className={classes}
      role="treeitem"
      data-tree-root={isRoot ? "true" : undefined}
      aria-level={depth + 1}
      aria-selected={node.status === "constraint"}
      aria-expanded={canExpand ? isOpen : undefined}
    >
      {canToggle ? (
        <button
          type="button"
          className="tax-item"
          onClick={() => onToggle(node.taxon.id)}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.taxon.name}`}
        >
          {label}
        </button>
      ) : (
        <div className="tax-item">{label}</div>
      )}
      {showKids ? (
        <ul className="tax-kids" role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.taxon.id}
              node={child}
              depth={depth + 1}
              flashId={flashId}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TreeSkeleton() {
  return (
    <ul className="tax-tree is-loading" aria-hidden="true">
      <li className="tax-node is-constraint is-root is-open">
        <div className="tax-item">
          <span className="tax-name">Animalia</span>
        </div>
        <ul className="tax-kids">
          <li className="tax-node is-remaining">
            <div className="tax-item">
              <span className="tax-name">Porifera</span>
            </div>
          </li>
          <li className="tax-node is-remaining">
            <div className="tax-item">
              <span className="tax-name">Cnidaria</span>
            </div>
          </li>
          <li className="tax-node is-remaining">
            <div className="tax-item">
              <span className="tax-name">Arthropoda</span>
            </div>
          </li>
          <li className="tax-node is-remaining">
            <div className="tax-item">
              <span className="tax-name">Chordata</span>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  );
}
