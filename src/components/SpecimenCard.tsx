import Image from "next/image";
import type { FossilRecord } from "@/lib/types";

const COMMONS_BASE = "https://commons.wikimedia.org/wiki/";

export function SpecimenCard({
  fossil,
  revealed,
  dateKey,
}: {
  fossil: FossilRecord;
  revealed: boolean;
  dateKey: string;
}) {
  return (
    <section className="panel specimen" aria-label="Today's fossil">
      <div className="specimen-frame">
        <Image
          src={fossil.imageSrc}
          alt={
            revealed
              ? `${fossil.taxon} fossil specimen`
              : "Today's mystery fossil specimen"
          }
          fill
          unoptimized
          sizes="(max-width: 860px) 100vw, 50vw"
          style={{ objectFit: "contain" }}
          priority
        />
      </div>
      <div className="specimen-meta">
        <div className="kicker">
          {dateKey} · {revealed ? fossil.taxon : "Identify the genus"}
        </div>
        <p className="attribution">
          Photo: {fossil.attribution} · {fossil.license}
          {" · "}
          <a
            href={`${COMMONS_BASE}${encodeURIComponent(fossil.commons_file)}`}
            target="_blank"
            rel="noreferrer"
          >
            Wikimedia Commons
          </a>
        </p>
      </div>
    </section>
  );
}
