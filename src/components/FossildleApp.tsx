"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fossils } from "@/lib/catalog";
import { CATALOG_SEED, MAX_GUESSES, puzzleForDay } from "@/lib/daily";
import { loadSavedGame, saveGame } from "@/lib/storage";
import { TaxonomyIndex } from "@/lib/taxonomy";
import type { GameStatus, TaxonomyData } from "@/lib/types";
import { GuessBoard } from "./GuessBoard";
import { GuessInput } from "./GuessInput";
import { SpecimenCard } from "./SpecimenCard";
import { TaxonomyTree } from "./TaxonomyTree";

export function FossildleApp() {
  const [taxonomy, setTaxonomy] = useState<TaxonomyIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<number[]>([]);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");
  const restoreRef = useRef(false);

  const puzzle = useMemo(() => puzzleForDay(fossils), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/taxonomy.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load taxonomy (${res.status})`);
        return res.json() as Promise<TaxonomyData>;
      })
      .then((data) => {
        if (!cancelled) setTaxonomy(new TaxonomyIndex(data));
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!taxonomy || restoreRef.current) return;
    const saved = loadSavedGame(puzzle.dateKey);
    if (saved && saved.fossilId === puzzle.fossil.id) {
      setGuesses(saved.guesses);
      setStatus(saved.status);
      if (saved.status === "won") {
        setMessage(`Yes — ${puzzle.fossil.taxon}.`);
      } else if (saved.status === "lost") {
        setMessage(`The cabinet closes. It was ${puzzle.fossil.taxon}.`);
        setMessageKind("error");
      }
    }
    restoreRef.current = true;
    setHydrated(true);
  }, [taxonomy, puzzle.dateKey, puzzle.fossil.id, puzzle.fossil.taxon]);

  useEffect(() => {
    if (!hydrated) return;
    saveGame({
      dateKey: puzzle.dateKey,
      fossilId: puzzle.fossil.id,
      guesses,
      status,
    });
  }, [guesses, status, hydrated, puzzle.dateKey, puzzle.fossil.id]);

  const prune = useMemo(
    () => taxonomy?.pruneRemaining(puzzle.fossil.taxonId, guesses) ?? null,
    [taxonomy, puzzle.fossil.taxonId, guesses],
  );

  function announce(text: string, kind: "ok" | "error" = "ok") {
    setMessage(text);
    setMessageKind(kind);
  }

  function submitGuess(raw: string): boolean {
    if (!taxonomy || !prune || status !== "playing") return false;
    const resolved = taxonomy.resolveGuess(raw, prune, guesses);
    if (!resolved.ok) {
      const reasons = {
        empty: "Type a genus to guess.",
        unknown: "That name is not in the local tree. Try another genus.",
        "not-genus": "Guess a genus, not a higher taxon.",
        "not-remaining": "That branch is already pruned away.",
        duplicate: "You already guessed that genus.",
      } as const;
      announce(reasons[resolved.reason], "error");
      return false;
    }

    const nextGuesses = [...guesses, resolved.taxon.id];
    setGuesses(nextGuesses);

    if (resolved.taxon.id === puzzle.fossil.taxonId) {
      setStatus("won");
      announce(
        resolved.viaAlias
          ? `${resolved.viaAlias} belongs to ${resolved.taxon.name}. Specimen identified.`
          : `Yes — ${resolved.taxon.name}.`,
      );
      return true;
    }

    if (nextGuesses.length >= MAX_GUESSES) {
      setStatus("lost");
      announce(`The cabinet closes. It was ${puzzle.fossil.taxon}.`, "error");
      return true;
    }

    const nextPrune = taxonomy.pruneRemaining(puzzle.fossil.taxonId, nextGuesses);
    const last = nextPrune.steps.at(-1);
    const shared = last ? taxonomy.require(last.mrcaId).name : "Animalia";
    const pruned = last?.prunedId ? taxonomy.require(last.prunedId).name : "that branch";
    announce(`Shared clade: ${shared}. Pruned ${pruned}.`);
    return true;
  }

  async function share() {
    if (!taxonomy) return;
    const score = status === "won" ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const trail = (prune?.steps ?? [])
      .map((step) => taxonomy.require(step.mrcaId).name)
      .join(" → ");
    const text = `Fossildle ${puzzle.dateKey} ${score}\n${trail}\n#Fossildle seed ${CATALOG_SEED.toString(16)}`;
    try {
      await navigator.clipboard.writeText(text);
      announce("Result copied to clipboard.");
    } catch {
      announce(text);
    }
  }

  const specimen = (
    <SpecimenCard
      fossil={puzzle.fossil}
      revealed={status !== "playing"}
      dateKey={puzzle.dateKey}
    />
  );

  if (loadError) {
    return (
      <div className="layout">
        {specimen}
        <div className="error-state" role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  if (!taxonomy || !prune) {
    return (
      <div className="layout">
        {specimen}
        <div className="guess-col">
          <div className="panel loading" role="status" aria-live="polite" aria-busy="true">
            Loading the taxonomic tree…
          </div>
        </div>
      </div>
    );
  }

  const remaining = taxonomy.remainingGenera(prune).length;

  return (
    <div className="layout">
      {specimen}
      <div className="guess-col">
        <GuessBoard
          taxonomy={taxonomy}
          guesses={guesses}
          prune={prune}
          answerId={puzzle.fossil.taxonId}
          status={status}
        />
        <GuessInput
          taxonomy={taxonomy}
          prune={prune}
          disabled={status !== "playing"}
          onSubmit={submitGuess}
        />
        <p className={`flash ${messageKind === "error" ? "error" : ""}`} aria-live="polite">
          {message ||
            (status === "playing"
              ? `${remaining.toLocaleString()} genera still possible · ${MAX_GUESSES - guesses.length} guess${
                  MAX_GUESSES - guesses.length === 1 ? "" : "es"
                } left`
              : "")}
        </p>
        {status !== "playing" && (
          <div className="result">
            <h3>
              {status === "won"
                ? `Identified in ${guesses.length}`
                : `It was ${puzzle.fossil.taxon}`}
            </h3>
            <p className="guess-note">
              Puzzle {puzzle.dateKey}. Same specimen worldwide until the next UTC midnight.
            </p>
            <div className="actions">
              <button type="button" onClick={() => void share()}>
                Copy result
              </button>
            </div>
          </div>
        )}
      </div>
      <TaxonomyTree
        taxonomy={taxonomy}
        prune={prune}
        answerId={status === "playing" ? null : puzzle.fossil.taxonId}
      />
    </div>
  );
}
