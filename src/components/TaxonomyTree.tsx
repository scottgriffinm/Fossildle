"use client";

import { useMemo, useState } from "react";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import type { PruneState } from "@/lib/types";

export function TaxonomyTree({
  taxonomy,
  prune,
}: {
  taxonomy: TaxonomyIndex;
  prune: PruneState;
}) {
  const constraint = taxonomy.require(prune.constraintId);
  const crumbs = taxonomy.displayPath(constraint.id);
  const [focusId, setFocusId] = useState(constraint.id);
  const parentId = taxonomy.isAncestor(constraint.id, focusId)
    ? focusId
    : constraint.id;
  const branches = useMemo(
    () => taxonomy.remainingBranches(prune, parentId),
    [taxonomy, prune, parentId],
  );
  const last = prune.steps.at(-1);
  const remaining = taxonomy.remainingGenera(prune).length;

  return (
    <section className="panel tree-panel" aria-label="Remaining taxonomy">
      <div className="tree-head">
        <div>
          <div className="kicker">Remaining subtree</div>
          <h2>{constraint.name}</h2>
        </div>
        <div className="guess-note">{remaining.toLocaleString()} genera</div>
      </div>
      <ol className="crumbs">
        {crumbs.map((taxon) => (
          <li key={taxon.id}>
            <strong>{taxon.name}</strong>
            <span>{taxon.rank}</span>
          </li>
        ))}
      </ol>
      {parentId !== constraint.id && (
        <p className="guess-note">
          Viewing {taxonomy.require(parentId).name}.{" "}
          <button
            type="button"
            className="branch"
            style={{ display: "inline-block", padding: "4px 10px" }}
            onClick={() => setFocusId(constraint.id)}
          >
            Back to {constraint.name}
          </button>
        </p>
      )}
      <div className="branches">
        {branches.length === 0 ? (
          <p className="guess-note">No further named branches remain in this view.</p>
        ) : (
          branches.slice(0, 24).map(({ taxon, genusCount }) => (
            <button
              key={taxon.id}
              type="button"
              className={`branch${taxon.id === parentId ? " active" : ""}`}
              onClick={() => setFocusId(taxon.id)}
            >
              <b>{taxon.name}</b>
              <span>
                {taxon.rank} · {genusCount.toLocaleString()} genera
              </span>
            </button>
          ))
        )}
      </div>
      {branches.length > 24 && (
        <p className="guess-note">{branches.length - 24} more clades not shown</p>
      )}
      {last?.prunedId && (
        <p className="pruned-note">
          Last prune: removed {taxonomy.require(last.prunedId).name} after a miss
          whose shared clade was {taxonomy.require(last.mrcaId).name}.
        </p>
      )}
    </section>
  );
}
