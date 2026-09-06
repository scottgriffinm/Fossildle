import { MAX_GUESSES } from "@/lib/daily";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import type { GameStatus, PruneState } from "@/lib/types";

export function GuessBoard({
  taxonomy,
  guesses,
  prune,
  answerId,
  status,
}: {
  taxonomy: TaxonomyIndex | null;
  guesses: number[];
  prune: PruneState | null;
  answerId: number;
  status: GameStatus;
}) {
  const slots = Array.from({ length: MAX_GUESSES }, (_, index) => guesses[index] ?? null);

  return (
    <ol className="guess-list panel" aria-label="Guesses">
      {slots.map((guessId, index) => {
        const filled = guessId != null && taxonomy != null;
        const step = prune?.steps[index];
        const taxon = filled ? taxonomy.require(guessId) : null;
        const won = filled && guessId === answerId;
        const lost = status === "lost" && index === guesses.length - 1;
        return (
          <li
            key={index}
            className={`guess-slot${filled ? " filled" : ""}${won ? " win" : ""}${
              lost ? " lose" : ""
            }`}
          >
            <span className="guess-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <div className="guess-name">{taxon ? taxon.name : "—"}</div>
              {taxonomy && step && !won && step.mrcaId && (
                <div className="guess-note">
                  shared {taxonomy.require(step.mrcaId).name}
                  {step.prunedId ? ` · pruned ${taxonomy.require(step.prunedId).name}` : ""}
                </div>
              )}
              {won && <div className="guess-note">correct genus</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
