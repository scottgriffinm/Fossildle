"use client";

import { useEffect, useMemo, useState } from "react";
import { colorRankPath } from "@/lib/rank-path";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import type { GameStatus, PruneState } from "@/lib/types";

export function TaxonomyPath({
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
  const [flashId, setFlashId] = useState<number | null>(null);
  const stepCount = prune?.steps.length ?? 0;
  const constraintId = prune?.constraintId;

  const segments = useMemo(() => {
    if (!taxonomy || !prune) return [];
    return colorRankPath(taxonomy, answerId, prune, status);
  }, [taxonomy, prune, answerId, status]);

  useEffect(() => {
    if (constraintId == null || stepCount === 0) return;
    const newestGreen = [...segments].reverse().find((segment) => segment.state === "green");
    setFlashId(newestGreen?.taxon.id ?? constraintId);
    const timer = window.setTimeout(() => setFlashId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [constraintId, stepCount, segments]);

  return (
    <section className="rank-path-panel" aria-label="Taxonomic path">
      {loading || !taxonomy || !prune ? (
        <PathSkeleton />
      ) : (
        <ol className="rank-path">
          {segments.map((segment, index) => {
            const hidden = segment.state === "unknown";
            const classes = [
              "rank-chip",
              `is-${segment.state}`,
              segment.taxon.rank === "genus" ? "is-genus" : "",
              flashId === segment.taxon.id ? "is-flash" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={`${segment.taxon.id}-${index}`} className="rank-step">
                <span
                  className={classes}
                  aria-label={
                    hidden
                      ? `${segment.rankLabel}, unknown`
                      : `${segment.rankLabel}, ${segment.taxon.name}`
                  }
                >
                  <span className="rank-label">{segment.rankLabel}</span>
                  <span className="rank-name" aria-hidden={hidden}>
                    {hidden ? "…" : segment.taxon.name}
                  </span>
                </span>
                {index < segments.length - 1 ? (
                  <span className="rank-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const SKELETON_RANKS = ["kingdom", "phylum", "class", "family", "genus"] as const;

function PathSkeleton() {
  return (
    <ol className="rank-path is-loading" aria-hidden="true">
      {SKELETON_RANKS.map((rank, index) => (
        <li key={rank} className="rank-step">
          <span className="rank-chip is-unknown">
            <span className="rank-label">{rank}</span>
            <span className="rank-name">…</span>
          </span>
          {index < SKELETON_RANKS.length - 1 ? (
            <span className="rank-arrow" aria-hidden="true">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
