# Fossildle

Wordle for fossils. Each UTC day shows one specimen photograph. Guess the
**animal**. After every miss the taxonomic path lights green as deep as
the clade you still share with the answer.

The game is fully client-side after load. Taxonomy and images are static
assets. There is no gameplay API.

## Play locally

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The `/about` page spells
out the prune rule and the data sources.

```bash
npm run build
npm start
```

## Deploy on Vercel

This is a standard Next.js App Router app.

1. Push the repo to GitHub.
2. [Import the project on Vercel](https://vercel.com/new).
3. Framework preset: **Next.js**. Build command: `npm run build`. Output: default.
4. No environment variables are required.

`vercel.json` only sets cache headers for `/data/*` and `/fossils/*`.
`npm run build` does **not** call Paleobiology Database; it uses the committed
`public/data/taxonomy.json`.

## Data

| Path | Role |
| --- | --- |
| `data/fossils.json` | Daily pool (32 verified PBDB genera + Commons images) |
| `public/fossils/` | Local copies of the photographs + attribution manifest |
| `public/data/taxonomy.json` | Offline Animalia tree used in the browser |
| `scripts/build-taxonomy.mjs` | Rebuilds the tree from [PBDB data1.2](https://paleobiodb.org/data1.2/) |
| `scripts/download-images.mjs` | Re-fetches Commons files into `public/fossils/` |

Regenerate artifacts (needs network, not needed for deploy):

```bash
npm run taxonomy:build
npm run images:download
```

v1 taxonomy scope: Animalia + all phyla/classes/orders, complete paths for
every starter fossil, and accepted genera from Dinosauria, Trilobita,
Ammonoidea, Placodermi, Avialae, Carnivora, Proboscidea, and Arthrodira.
See `SPEC.md` for the prune rule and daily-seed math.

## Tests

```bash
npm test
```

Covers `mrca`, `pathToRoot`, `pruneRemaining`, rank-path green depth,
species→genus aliases, deterministic UTC daily rotation, and “all
starter genera resolve on the shipped tree”.
