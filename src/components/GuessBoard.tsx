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
  if (guesses.length === 0) return null;

  return (
    <ol className="guess-list" aria-label="Guesses">
      {guesses.map((guessId, index) => {
        const step = prune?.steps[index];
        const taxon = taxonomy?.require(guessId) ?? null;
        const won = guessId === answerId;
        const lost = status === "lost" && index === guesses.length - 1;
        return (
          <li
            key={`${guessId}-${index}`}
            className={`guess-slot filled${won ? " win" : ""}${lost ? " lose" : ""}`}
          >
            <span className="guess-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <div className="guess-name">{taxon ? taxon.name : "—"}</div>
              {taxonomy && step && !won && step.mrcaId && (
                <div className="guess-note">
                  through {taxonomy.require(step.mrcaId).name}
                </div>
              )}
              {won && <div className="guess-note">that&apos;s the animal</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
