import commonNamesJson from "../../data/common-names.json";
import type { FossilRecord, TaxonAlias } from "./types";

type CommonNameRow = {
  name: string;
  id: number;
  via?: string;
};

export const COMMON_NAME_ALIASES: TaxonAlias[] = (
  commonNamesJson.names as CommonNameRow[]
).map((row) => ({ name: row.name, id: row.id }));

const primaryById = new Map<number, string>();
const labelsById = new Map<number, string[]>();

for (const row of commonNamesJson.names as CommonNameRow[]) {
  const labels = labelsById.get(row.id) ?? [];
  if (!labels.some((label) => label.toLowerCase() === row.name.toLowerCase())) {
    labels.push(row.name);
  }
  labelsById.set(row.id, labels);
  if (!primaryById.has(row.id)) {
    primaryById.set(row.id, row.name);
  }
}

export function commonLabelsFor(id: number): string[] {
  return labelsById.get(id) ?? [];
}

export function primaryCommonName(id: number, fallback?: string): string | undefined {
  return primaryById.get(id) ?? fallback;
}

export function animalLabel(fossil: FossilRecord): string {
  return fossil.commonName ?? fossil.taxon;
}

export function articleFor(name: string): string {
  return /^[aeiou]/i.test(name.trim()) ? "an" : "a";
}

export function animalPhrase(fossil: FossilRecord): string {
  const label = animalLabel(fossil);
  return `${articleFor(label)} ${label}`;
}
