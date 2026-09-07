import fossilsJson from "../../data/fossils.json";
import manifestJson from "../../public/fossils/manifest.json";
import { parsePbdbOid } from "./taxonomy";
import type { FossilRecord } from "./types";

type FossilSource = (typeof fossilsJson)["fossils"][number];
type ManifestEntry = (typeof manifestJson)[number];

const manifestById = new Map<string, ManifestEntry>(
  manifestJson.map((entry) => [entry.id, entry]),
);

export const fossils: FossilRecord[] = fossilsJson.fossils.map((fossil: FossilSource) => {
  const image = manifestById.get(fossil.id);
  const commonName =
    "common_name" in fossil && typeof fossil.common_name === "string"
      ? fossil.common_name
      : undefined;
  return {
    ...fossil,
    commonName,
    taxonId: parsePbdbOid(fossil.pbdb_oid),
    imageSrc: `/${image?.file ?? `fossils/${fossil.id}.jpg`}`,
  };
});

export const fossilsById = new Map(fossils.map((fossil) => [fossil.id, fossil]));
