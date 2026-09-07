import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "About Fossildle",
};

export default function AboutPage() {
  return (
    <main className="shell">
      <SiteHeader current="about" />
      <article className="prose">
        <h1>How Fossildle works</h1>
        <p>
          Each UTC day shows one fossil photograph. You have six guesses to name
          the <em>animal</em> — the creature that fossil came from. Common names
          work when we have them (mammoth, T. rex), and so do scientific names.
          After every miss, matching standard ranks on the taxonomic path
          turn green down to the clade you still share with the answer.
          Search only offers animals that are still possible.
        </p>

        <h2>Prune rule</h2>
        <p>
          Remaining taxa start as all of Animalia. For a wrong guess G against
          answer A:
        </p>
        <ol>
          <li>
            Compute <code>M = MRCA(G, A)</code> — the deepest taxon that contains
            both names.
          </li>
          <li>
            Reveal M. The remaining set tightens to descendants of M
            (including M).
          </li>
          <li>
            Let C be the child of M that contains G. Eliminate C and its
            entire subtree. That is the exclusive branch of your guess.
          </li>
        </ol>
        <p>
          So a distant miss (an arthropod when the answer is a theropod) greens
          the path through the shared high clade and removes that arthropod
          line from later guesses. A close miss (a ceratopsian when the answer
          is a tyrannosaur) greens down to Dinosauria and throws out
          Ornithischia. Naming the right animal wins. A species or common name
          that maps to that animal —{" "}
          <em>Tyrannosaurus rex</em> or T. rex for <em>Tyrannosaurus</em> — also
          wins.
        </p>

        <h2>Daily puzzle</h2>
        <p>
          The 32-specimen catalog is shuffled once with a constant seed
          (<code>0xF05511DE</code>), then indexed by{" "}
          <code>utcDayIndex % poolLength</code>. Everyone on Earth gets the same
          fossil from 00:00 UTC to the next midnight.
        </p>

        <h2>Client-only after load</h2>
        <p>
          Taxonomy, the catalog, and the photographs are static files shipped
          with the app. After the first page load there are no gameplay calls to
          Paleobiology Database, Wikimedia, or any other API. Guesses, search,
          and pruning all run in the browser.
        </p>

        <h2>Data sources</h2>
        <ul>
          <li>
            Taxonomy:{" "}
            <a href="https://paleobiodb.org/data1.2/">
              Paleobiology Database data service 1.2
            </a>
            , assembled offline by <code>npm run taxonomy:build</code> using
            parent links (<code>par</code> / <code>prl</code>) and rooted at
            Animalia.
          </li>
          <li>
            Photographs: Wikimedia Commons files cached in{" "}
            <code>public/fossils/</code>. License and author stay on screen
            every day.
          </li>
        </ul>
        <p>
          Classifications follow PBDB opinion space. Informal and unranked
          clades (Dinosauria, Avialae, and so on) are kept because they are the
          language paleontology actually uses.
        </p>
      </article>
    </main>
  );
}
