import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fossils } from "./catalog";
import { MAX_GUESSES } from "./daily";
import { TaxonomyIndex, parsePbdbOid } from "./taxonomy";
import type { TaxonomyData } from "./types";

const data = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/data/taxonomy.json"), "utf8"),
) as TaxonomyData;
const tax = new TaxonomyIndex(data);

describe("automated playthroughs on the shipped tree", () => {
  it("accepts a first-try genus win and a species alias win", () => {
    for (const fossil of fossils) {
      const open = tax.pruneRemaining(fossil.taxonId, []);
      const genus = tax.resolveGuess(fossil.taxon, open, []);
      expect(genus.ok).toBe(true);
      if (genus.ok) expect(genus.taxon.id).toBe(fossil.taxonId);

      const alias = data.aliases.find(
        (item) =>
          item.id === fossil.taxonId &&
          item.name.toLowerCase() !== fossil.taxon.toLowerCase(),
      );
      if (alias) {
        const resolved = tax.resolveGuess(alias.name, open, []);
        expect(resolved.ok).toBe(true);
        if (resolved.ok) expect(resolved.taxon.id).toBe(fossil.taxonId);
      }
    }
  });

  it("never needs more remaining-set info than local prune state", () => {
    const answer = parsePbdbOid("txn:38613");
    const sequence = [
      parsePbdbOid("txn:21701"), // Phacops
      parsePbdbOid("txn:15382"), // Perisphinctes — already pruned after first miss
      parsePbdbOid("txn:38862"), // Triceratops
      parsePbdbOid("txn:38669"), // Diplodocus
      answer,
    ];

    const guesses: number[] = [];
    for (const guess of sequence) {
      const state = tax.pruneRemaining(answer, guesses);
      const taxon = tax.require(guess);
      const resolved = tax.resolveGuess(taxon.name, state, guesses);
      if (!resolved.ok) {
        expect(guess).toBe(parsePbdbOid("txn:15382"));
        expect(resolved.reason).toBe("not-remaining");
        continue;
      }
      guesses.push(guess);
      if (guess === answer) break;
    }
    expect(guesses.at(-1)).toBe(answer);
    expect(guesses.length).toBeLessThanOrEqual(MAX_GUESSES);
  });
});
