/** Player-facing remaining-set count. Singular/plural on "fossil". */
export function remainingFossilsCopy(count: number): string {
  const n = count.toLocaleString();
  return count === 1 ? `${n} fossil still possible` : `${n} fossils still possible`;
}
