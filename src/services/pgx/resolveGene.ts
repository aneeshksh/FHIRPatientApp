import type { GeneResolution, PgxData } from "./types";

// The diplotype table stores exactly one canonical allele order per pair
// (confirmed against the data: CYP2D6 has "*1/*4" but never "*4/*1"). A
// diplotype is always exactly two alleles joined by one "/" — swap the two
// sides so a caller-provided reversed order still resolves. Returns null if
// the string doesn't look like a simple two-allele diplotype (defensive;
// no such rows exist in the current data, but this keeps a stray extra "/"
// from producing a bogus swapped string instead of just failing to match).
function reverseDiplotype(diplotype: string): string | null {
  const slashIndex = diplotype.indexOf("/");
  if (slashIndex === -1) return null;

  const first = diplotype.slice(0, slashIndex);
  const rest = diplotype.slice(slashIndex + 1);
  if (rest.includes("/")) return null;

  return `${rest}/${first}`;
}

// Step 1 — diplotype -> phenotype + activity score (dev notes §5).
// Never returns null/throws on an unknown diplotype: callers get an
// explicit `matched: false` result so it can be flagged rather than
// silently skipped.
export function resolveGene(data: PgxData, gene: string, diplotype: string): GeneResolution {
  const byDiplotype = data.diplotypesByGene.get(gene);

  const direct = byDiplotype?.get(diplotype);
  if (direct) {
    return {
      matched: true,
      gene,
      diplotype,
      phenotype: direct.phenotype,
      activityScore: direct.totalactivityscore,
    };
  }

  const reversed = reverseDiplotype(diplotype);
  const reversedMatch = reversed ? byDiplotype?.get(reversed) : undefined;
  if (reversedMatch) {
    return {
      matched: true,
      gene,
      diplotype,
      phenotype: reversedMatch.phenotype,
      activityScore: reversedMatch.totalactivityscore,
    };
  }

  return { matched: false, gene, diplotype, reason: "unknown_diplotype" };
}
