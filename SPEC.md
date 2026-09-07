# Fossildle specification

Fossildle is a daily, Wordle-like identification game. The player is guessing
the **animal** (the creature the fossil came from). Under the hood the secret
is still a scientific **genus**. Feedback is phylogenetic: each miss reveals
the shared clade with the answer and prunes impossible branches of the
Animalia tree.

## Client-only constraint

After the initial HTML/JS/CSS/static-asset load, **gameplay makes no network
calls**. In particular:

- No Paleobiology Database requests
- No Wikimedia / Commons requests
- No custom backend APIs

The browser loads `/data/taxonomy.json` once (a static file), plus the day's
image from `/fossils/`. Guess validation, autocomplete, MRCA, and pruning are
pure functions over that in-memory tree. Optional `localStorage` remembers
today's guesses (`fossildle:v1:YYYY-MM-DD`).

## Guessing

- Rank to guess: **genus** (six attempts). Player-facing copy says **animal**.
- Matching is case-insensitive and accent-insensitive.
- A species or subspecies binomial that maps to a genus via shipped aliases
  (PBDB children of each starter genus, plus the genus name itself) is treated
  as that genus. If that genus is the answer, the player wins.
- Common names from PBDB `nm2` and the catalog (T. rex, mammoth, saber-toothed
  cat, …) also resolve to that genus.
- Higher taxa (`Dinosauria`, `Mammalia`, …) are rejected: “Guess the fossil”.
- Search/autocomplete lists only **remaining** animals and matches common
  names where we have them.

## Prune rule

Let `R` be the remaining set, initially every taxon in the shipped Animalia
tree.

For each wrong guess `G` against answer `A`:

1. `M = mrca(G, A)` — deepest common ancestor in the shipped tree.
2. Remaining taxa become `M` and its descendants (intersection with the
   previous remaining set; `M` is always inside the previous constraint).
3. Let `C` be the child of `M` that lies on the path from `M` down to `G`.
   Eliminate `C` and all descendants of `C`.

A taxon is still playable when it is under the current constraint `M` and is
not under any eliminated exclusive-branch root.

This is meant to be fair and teachable:

- Distant miss: high `M`, large `C` removed (e.g. guess `Phacops`, answer
  `Tyrannosaurus` → shared `Eubilateria`, prune `Protostomia`).
- Close miss: low `M`, sibling radiation removed (e.g. guess `Triceratops` →
  shared `Dinosauria`, prune `Ornithischia`).

Helpers (`src/lib/taxonomy.ts`):

- `pathToRoot(id)` — `[id, parent, …, Animalia]`
- `mrca(a, b)`
- `pruneRemaining(answerId, guesses[])`

The tree UI is a left-to-right cladogram: Animalia (or the current
constraint) sits on the left, and lineages branch to the right toward
sparse tips. A fresh game shows the remaining Animalia radiation —
phyla and classes packed so Porifera, Cnidaria, arthropods/molluscs,
and Chordata are visible together — not a collapsed top slice and not
every PBDB stem rank. Unranked spine wrappers (Bilateria, Eubilateria,
Protostomia, Deuterostomia, and similar comb nodes) are flattened on
the high crown so those phyla hang near the root. Genera and other deep
ranks stay hidden until the remaining set is small. Nodes are placed
with a packed leaf-row layout (parents at leaf midpoints). Each parent
name sits on its branch: a thin stem leaves the right of the name, a
vertical bar gathers siblings, and a real twig reaches each child —
a left-to-right cladogram, not a spine with tick marks. The
finished crown is scaled to the panel so the opening view does not
require panning. Scrollbar chrome stays hidden; wheel/touch pan still
works if a later expansion overflows. Nodes with remaining children can
still expand or collapse when the taxon name is clicked — no +/− twisty
controls. After each miss the view is only the remaining constraint
subtree — pruned clades are removed, not greyed — and the leftover tree
is again packed to fit. Autocomplete uses the same remaining set.

## Daily rotation

1. Take the committed catalog `data/fossils.json` (32 specimens).
2. Fisher–Yates shuffle with Mulberry32, seed `CATALOG_SEED = 0xF05511DE`.
3. `dayIndex = floor(UTC-midnight(date) / 86400000)` (Unix UTC days).
4. Today's fossil is `shuffled[dayIndex % poolLength]`.

The same UTC day is the same puzzle worldwide. Changing the seed reshuffles
the whole cycle.

## Taxonomy pipeline

`scripts/build-taxonomy.mjs` (offline, not part of `next build`):

1. Pull PBDB `data1.2` taxa with parent fields `par` / `prl`.
2. Ingest Animalia, every Animalia phylum / class / order, complete
   `all_parents` paths for the starter genera, accepted genera in
   Dinosauria, Trilobita, Ammonoidea, Placodermi, Avialae, Carnivora,
   Proboscidea, and Arthrodira, plus a short list of famous extra genera.
3. Walk any missing parent ids until every kept node reaches Animalia.
4. Drop nodes that do not root at Animalia (`txn:67091`). Animalia has
   `parentId: null`.
5. Validate: no cycles; every starter genus exists, is rank genus, and has a
   path to Animalia.
6. Write `public/data/taxonomy.json` and `public/data/taxonomy.meta.json`.

Species of starter genera are **not** playable tree nodes. They are stored as
aliases so binomials normalize to the parent genus.

A full ~80k-genus Animalia dump is avoided in CI. The committed artifact is
already a broad searchable fossil tree (~19k taxa, ~13k genera, ~1.3 MB JSON).

Images are downloaded from the catalog `image_url`s into `public/fossils/`
(`npm run images:download`) and shown with license + author at all times.

## Winning and losing

- Win: guess the answer animal (genus, species alias, or common name).
- Lose: six wrong animals. The answer is revealed as the animal, not a
  lecture about genus. Attribution remains visible.

## Out of scope for v1

- Server-side scoreboards
- Live PBDB queries
- Guessing higher taxa as first-class answers
- Expanding the daily pool beyond the committed catalog (the engine will
  accept more catalog rows without code changes)
