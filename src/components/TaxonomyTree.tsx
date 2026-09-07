"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import { buildCabinetTree, type TreeNodeView } from "@/lib/tree-view";
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
  const last = prune?.steps.at(-1);

  useEffect(() => {
    if (constraintId == null || stepCount === 0 || status !== "playing") return;
    setFlashId(constraintId);
    const timer = window.setTimeout(() => setFlashId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [constraintId, stepCount, status]);

  const tree = useMemo(() => {
    if (!taxonomy || !prune) return null;
    return buildCabinetTree(
      taxonomy,
      prune,
      status === "won" && answerId != null ? { revealId: answerId } : undefined,
    );
  }, [taxonomy, prune, status, answerId]);

  return (
    <section className="tree-panel" aria-label="Taxonomic tree">
      <div className="tree-scroll">
        {loading || !tree || !taxonomy ? (
          <TreeSkeleton />
        ) : (
          <ul className="tax-tree" aria-label="Remaining taxonomic hierarchy">
            <TreeNode node={tree} flashId={flashId} isRoot />
          </ul>
        )}
      </div>
    </section>
  );
}

function TreeNode({
  node,
  flashId,
  isRoot = false,
}: {
  node: TreeNodeView;
  flashId: number | null;
  isRoot?: boolean;
}) {
  const flashing = flashId === node.taxon.id;
  const isGenus = node.taxon.rank === "genus";

  const classes = [
    "tax-node",
    `is-${node.status}`,
    isRoot ? "is-root" : "",
    flashing ? "is-flash" : "",
    isGenus ? "is-genus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes}>
      <div className="tax-item">
        <span className="tax-name">{node.taxon.name}</span>
      </div>
      {node.children.length > 0 && (
        <ul className="tax-kids">
          {node.children.map((child) => (
            <TreeNode key={child.taxon.id} node={child} flashId={flashId} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeSkeleton() {
  return (
    <ul className="tax-tree is-loading" aria-hidden="true">
      <li className="tax-node is-constraint is-root">
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
              <span className="tax-name">Bilateria</span>
            </div>
            <ul className="tax-kids">
              <li className="tax-node is-remaining">
                <div className="tax-item">
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
