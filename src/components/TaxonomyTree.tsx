"use client";

import { useEffect, useState } from "react";
import { laymanTitle } from "@/lib/layman";
import { sharedDepthId } from "@/lib/rank-path";
import {
  openingExpandedIds,
  paintTaxon,
  sharedPathExpandIds,
  type TreePaint,
} from "@/lib/tree-paint";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import type { GameStatus, PruneState, Taxon } from "@/lib/types";

export function TaxonomyTree({
  taxonomy,
  prune,
  status = "playing",
  answerId,
  loading = false,
}: {
  taxonomy: TaxonomyIndex | null;
  prune: PruneState | null;
  status?: GameStatus;
  answerId: number;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [flashId, setFlashId] = useState<number | null>(null);
  const stepCount = prune?.steps.length ?? 0;
  const constraintId = prune?.constraintId;
  const sharedId =
    taxonomy && prune ? sharedDepthId(taxonomy, answerId, prune) : null;

  useEffect(() => {
    if (!taxonomy) return;
    setExpanded(new Set(openingExpandedIds(taxonomy)));
  }, [taxonomy]);

  useEffect(() => {
    if (!taxonomy || !prune) return;
    const extra = sharedPathExpandIds(taxonomy, answerId, prune);
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of extra) next.add(id);
      return next;
    });
  }, [taxonomy, prune, answerId, sharedId, stepCount]);

  useEffect(() => {
    if (constraintId == null || stepCount === 0) return;
    setFlashId(sharedId ?? constraintId);
    const timer = window.setTimeout(() => setFlashId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [constraintId, stepCount, sharedId]);

  const ready = Boolean(taxonomy && prune && !loading);

  function toggle(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="tree-panel" aria-label="Animalia taxonomy">
      <div className="tree-scroll">
        {!ready || !taxonomy || !prune ? (
          <TreeSkeleton />
        ) : (
          <ul className="tax-tree" role="tree" aria-label="Full Animalia taxonomy">
            <TreeNode
              taxonomy={taxonomy}
              taxon={taxonomy.require(taxonomy.rootId)}
              prune={prune}
              status={status}
              answerId={answerId}
              expanded={expanded}
              flashId={flashId}
              onToggle={toggle}
            />
          </ul>
        )}
      </div>
    </section>
  );
}

function TreeNode({
  taxonomy,
  taxon,
  prune,
  status,
  answerId,
  expanded,
  flashId,
  onToggle,
}: {
  taxonomy: TaxonomyIndex;
  taxon: Taxon;
  prune: PruneState;
  status: GameStatus;
  answerId: number;
  expanded: Set<number>;
  flashId: number | null;
  onToggle: (id: number) => void;
}) {
  const kids = taxonomy.children.get(taxon.id) ?? [];
  const canExpand = kids.length > 0;
  const isOpen = canExpand && expanded.has(taxon.id);
  const paint: TreePaint = paintTaxon(taxonomy, taxon.id, answerId, prune, status);
  const layman = laymanTitle(taxon);
  const flashing = flashId === taxon.id;

  const classes = [
    "tax-node",
    `is-${paint}`,
    canExpand ? "is-expandable" : "is-leaf",
    isOpen ? "is-open" : "",
    flashing ? "is-flash" : "",
    taxon.rank === "genus" ? "is-genus" : "",
    taxon.parentId == null ? "is-root" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = (
    <>
      <span className="tax-name">{taxon.name}</span>
      {layman ? <span className="tax-layman">{layman}</span> : null}
    </>
  );

  return (
    <li
      className={classes}
      role="treeitem"
      aria-selected={paint === "green"}
      aria-expanded={canExpand ? isOpen : undefined}
    >
      {canExpand ? (
        <button
          type="button"
          className="tax-item"
          onClick={() => onToggle(taxon.id)}
          aria-expanded={isOpen}
        >
          {label}
        </button>
      ) : (
        <div className="tax-item">{label}</div>
      )}
      {isOpen ? (
        <ul className="tax-kids" role="group">
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              taxonomy={taxonomy}
              taxon={child}
              prune={prune}
              status={status}
              answerId={answerId}
              expanded={expanded}
              flashId={flashId}
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
      <li className="tax-node is-neutral is-root is-open">
        <div className="tax-item">
          <span className="tax-name">Animalia</span>
          <span className="tax-layman">animals</span>
        </div>
        <ul className="tax-kids">
          <li className="tax-node is-neutral is-expandable">
            <div className="tax-item">
              <span className="tax-name">Bilateria</span>
              <span className="tax-layman">bilaterians</span>
            </div>
          </li>
          <li className="tax-node is-neutral is-expandable">
            <div className="tax-item">
              <span className="tax-name">Porifera</span>
              <span className="tax-layman">sponges</span>
            </div>
          </li>
          <li className="tax-node is-neutral is-expandable">
            <div className="tax-item">
              <span className="tax-name">Cnidaria</span>
              <span className="tax-layman">cnidarians</span>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  );
}
