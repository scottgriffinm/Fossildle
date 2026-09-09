"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fossils } from "@/lib/catalog";
import { remainingFossilsCopy } from "@/lib/copy";
import { CATALOG_SEED, MAX_GUESSES, puzzleForDay } from "@/lib/daily";
import { animalPhrase } from "@/lib/names";
import { loadSavedGame, saveGame } from "@/lib/storage";
import { TaxonomyIndex } from "@/lib/taxonomy";
import type { GameStatus, TaxonomyData } from "@/lib/types";
import { GuessBoard } from "./GuessBoard";
import { GuessInput } from "./GuessInput";
import { SiteHeader } from "./SiteHeader";
import { SpecimenCard } from "./SpecimenCard";
import { TaxonomyPath } from "./TaxonomyPath";

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
  const animal = animalPhrase(puzzle.fossil);

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
        setMessage(`Yes — that's ${animal}.`);
      } else if (saved.status === "lost") {
        setMessage(`Out of guesses. It was ${animal}.`);
        setMessageKind("error");
      }
    }
    restoreRef.current = true;
    setHydrated(true);
  }, [taxonomy, puzzle.dateKey, puzzle.fossil.id, animal]);

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
        empty: "Type an animal to guess.",
        unknown: "That name is not in the local tree. Try another animal.",
        "not-genus": "Guess the fossil, not a higher group.",
        "not-remaining": "That branch is already pruned away.",
        duplicate: "You already guessed that animal.",
      } as const;
      announce(reasons[resolved.reason], "error");
      return false;
    }

    const nextGuesses = [...guesses, resolved.taxon.id];
    setGuesses(nextGuesses);

    if (resolved.taxon.id === puzzle.fossil.taxonId) {
      setStatus("won");
      announce(`Yes — that's ${animal}.`);
      return true;
    }

    if (nextGuesses.length >= MAX_GUESSES) {
      setStatus("lost");
      announce(`Out of guesses. It was ${animal}.`, "error");
      return true;
    }

    const nextPrune = taxonomy.pruneRemaining(puzzle.fossil.taxonId, nextGuesses);
    const last = nextPrune.steps.at(-1);
    const shared = last ? taxonomy.require(last.mrcaId).name : "Animalia";
    announce(`Match through ${shared}.`);
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

  const guessesLeft = MAX_GUESSES - guesses.length;
  const remaining = taxonomy && prune ? taxonomy.remainingGenera(prune).length : null;
  const showResult = status !== "playing";

  return (
    <>
      <SiteHeader
        current="play"
        dateKey={puzzle.dateKey}
        guessesLeft={status === "playing" ? guessesLeft : 0}
        playing={status === "playing"}
      />
      <div className="board">
        <div className="play-stage">
          <div className="play-hero">
            <SpecimenCard
              fossil={puzzle.fossil}
              revealed={status !== "playing"}
              dateKey={puzzle.dateKey}
            />
          </div>
          <TaxonomyPath
            taxonomy={taxonomy}
            prune={prune}
            status={status}
            answerId={puzzle.fossil.taxonId}
            loading={!taxonomy || !prune}
          />
          <div className={`play-side${guesses.length === 0 && !showResult ? " is-empty" : ""}`}>
            <div className="play-guesses">
              <GuessBoard
                taxonomy={taxonomy}
                guesses={guesses}
                prune={prune}
                answerId={puzzle.fossil.taxonId}
                status={status}
              />
              {showResult && (
                <div className="result">
                  <h3>
                    {status === "won"
                      ? `Yes — that's ${animal}`
                      : `It was ${animal}`}
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
          </div>
        </div>
        <div className="play-compose">
          {loadError ? (
            <div className="error-state" role="alert">
              {loadError}
            </div>
          ) : taxonomy && prune ? (
            <GuessInput
              taxonomy={taxonomy}
              prune={prune}
              disabled={status !== "playing"}
              onSubmit={submitGuess}
            />
          ) : (
            <div className="composer">
              <label htmlFor="animal-guess">Guess the fossil</label>
              <div className="input-wrap">
                <input id="animal-guess" disabled placeholder="Loading fossils…" />
                <button className="guess-btn" type="button" disabled>
                  Guess
                </button>
              </div>
            </div>
          )}
          <p className={`flash ${messageKind === "error" ? "error" : ""}`} aria-live="polite">
            {message ||
              (status === "playing"
                ? remaining != null
                  ? remainingFossilsCopy(remaining)
                  : "Loading today's taxonomy…"
                : "")}
          </p>
        </div>
      </div>
    </>
  );
}
