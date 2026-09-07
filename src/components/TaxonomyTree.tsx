"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import {
  DEFAULT_METRICS,
  fitScale,
  layoutCladogram,
  type PlacedNode,
} from "@/lib/cladogram-layout";
import {
  autoExpandIds,
  buildCabinetTree,
  expandBranchIds,
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
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const layout = useMemo(() => (tree ? layoutCladogram(tree) : null), [tree]);

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
      <div className="tree-scroll" ref={scrollRef}>
        {loading || !layout || !taxonomy ? (
          <TreeSkeleton />
        ) : (
          <Cladogram
            layout={layout}
            flashId={flashId}
            expanded={expanded}
            constraintId={constraintId}
            scrollRef={scrollRef}
            onToggle={toggle}
          />
        )}
      </div>
    </section>
  );
}

function Cladogram({
  layout,
  flashId,
  expanded,
  constraintId,
  scrollRef,
  onToggle,
}: {
  layout: NonNullable<ReturnType<typeof layoutCladogram>>;
  flashId: number | null;
  expanded: Set<number>;
  constraintId: number | undefined;
  scrollRef: RefObject<HTMLDivElement | null>;
  onToggle: (id: number) => void;
}) {
  const [scale, setScale] = useState(1);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const measure = () => {
      const style = window.getComputedStyle(scroller);
      const padX =
        Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const padY =
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const viewW = Math.max(1, scroller.clientWidth - padX);
      const viewH = Math.max(1, scroller.clientHeight - padY);
      const next = fitScale(layout.width, layout.height, viewW, viewH, {
        min: 0.62,
        pad: 2,
      });
      setScale(next);
      const fittedW = layout.width * next;
      const fittedH = layout.height * next;
      setFits(fittedW <= viewW + 0.5 && fittedH <= viewH + 0.5);
      scroller.scrollTo({ top: 0, left: 0 });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [layout, scrollRef]);

  const fittedW = Math.max(1, layout.width * scale);
  const fittedH = Math.max(1, layout.height * scale);

  return (
    <div
      className={`cladogram-fit${fits ? " is-fit" : ""}`}
      style={{
        width: fittedW,
        height: fittedH,
      }}
      data-cladogram-engine={layout.engine}
      data-cladogram-leaves={layout.leafCount}
      data-cladogram-scale={scale.toFixed(3)}
    >
      <svg
        className="cladogram"
        width={layout.width}
        height={layout.height}
        overflow="visible"
        role="tree"
        aria-label="Remaining taxonomic hierarchy"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <g className="cladogram-links" aria-hidden="true">
          <path d={layout.stem.d} />
          {layout.links.map((link) => (
            <path key={`${link.parentId}-${link.childId}`} d={link.d} />
          ))}
        </g>
        <g className="cladogram-labels">
          {layout.nodes.map((node) => (
            <CladeLabel
              key={node.id}
              node={node}
              flashId={flashId}
              expanded={expanded}
              isRoot={node.id === constraintId || node.depth === 0}
              onToggle={onToggle}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function CladeLabel({
  node,
  flashId,
  expanded,
  isRoot,
  onToggle,
}: {
  node: PlacedNode;
  flashId: number | null;
  expanded: Set<number>;
  isRoot: boolean;
  onToggle: (id: number) => void;
}) {
  const flashing = flashId === node.id;
  const isGenus = node.rank === "genus";
  const canExpand = node.expandable;
  const isOpen = !canExpand || expanded.has(node.id) || node.status === "constraint";
  const canToggle = canExpand && node.status !== "constraint";

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

  function activate() {
    if (canToggle) onToggle(node.id);
  }

  function onKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (!canToggle) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle(node.id);
    }
  }

  const hitH = DEFAULT_METRICS.fontSize + 6;

  return (
    <g
      className={classes}
      role="treeitem"
      data-tree-root={isRoot ? "true" : undefined}
      data-tip={node.isTip ? "true" : "false"}
      aria-level={node.depth + 1}
      aria-selected={node.status === "constraint"}
      aria-expanded={canExpand ? isOpen : undefined}
      tabIndex={canToggle ? 0 : undefined}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <rect
        className="tax-hit"
        x={node.labelX - 2}
        y={node.isTip ? node.y - hitH / 2 : node.labelY - DEFAULT_METRICS.fontSize}
        width={node.labelWidth + 4}
        height={hitH}
      />
      <text
        className="tax-name"
        x={node.labelX}
        y={node.isTip ? node.y : node.labelY}
        dominantBaseline={node.isTip ? "central" : "auto"}
        fontSize={DEFAULT_METRICS.fontSize}
      >
        {node.name}
        {canExpand && !isOpen ? <tspan className="tax-more"> ›</tspan> : null}
      </text>
    </g>
  );
}

function TreeSkeleton() {
  return (
    <div className="cladogram-fit is-fit">
      <ul className="tax-tree is-ltr is-loading" aria-hidden="true">
        <li className="tax-node is-constraint is-root is-open">
          <div className="tax-item">
            <span className="tax-name">Animalia</span>
          </div>
        </li>
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
    </div>
  );
}
