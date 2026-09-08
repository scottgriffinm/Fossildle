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

- Rank to guess: **genus** (six attempts). Player-facing Identify/Guess copy says **Guess the fossil**.
- Matching is case-insensitive and accent-insensitive.
- A species or subspecies binomial that maps to a genus via shipped aliases
  (PBDB children of each starter genus, plus the genus name itself) is treated
  as that genus. If that genus is the answer, the player wins.
- Common names from PBDB `nm2` and the catalog (T. rex, mammoth, saber-toothed
  cat, …) also resolve to that genus.
- Higher taxa (`Dinosauria`, `Mammalia`, …) are rejected: “Guess the fossil”.
- Search/autocomplete lists only **remaining** fossils and matches common
  names where we have them. The remaining-count line says fossils
  (`13,293 fossils still possible`, or `1 fossil still possible`).

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

The play UI keeps a Wordle-like **taxonomic path** on one row, and fills
the leftover board with an expandable **full Animalia outline** (not a
cladogram, not limited to the remaining-possible set).

The path is a clean standard-rank ladder from the answer path: kingdom,
phylum, class, order, family, genus — only ranks that actually exist,
deepest taxon of each so PBDB stem duplicates drop out. Unranked stem
wrappers (Bilateria, Eubilateria, Protostomia, Deuterostomia, and the
like) are not padded in as empty CLADE tiles.

Until the first guess, every rank — including Animalia / kingdom —
stays muted (rank label + ellipsis). After a guess, green = taxa on
the shared path from Animalia down to the remaining constraint (the
MRCA of the latest miss and the answer). Deeper standard ranks stay
muted: rank label + ellipsis, never prune leftovers.
If the current constraint is a named non-standard clade (Amniota,
Dinosauria, Eubilateria, …) it is inserted **by that name** so green
depth is visible; it is never shown as a blank CLADE slot. A hit greens
the whole path, including genus. Autocomplete still uses the remaining
set from `pruneRemaining`.

The outline starts collapsed at Animalia plus its shallow children.
Click a name to expand; collapsed subtrees are not mounted. Layman
titles sit under scientific names only when they add real English
(sponges, mammals, birds, trilobites). Latin echoes (bilaterians) and
rank glosses (a clade, a class) are omitted. Regular `-idae` / `-inae`
endings still become English group names. The outline
flexes into leftover board space with a modest max height; it does
not invent a tall section or show scrollbar chrome.
Tree paint: green = confirmed shared path, red = ruled out, white =
still ambiguous. Animalia is not green until the first guess. The full
scaffold stays browsable; only the paint follows game state.

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
