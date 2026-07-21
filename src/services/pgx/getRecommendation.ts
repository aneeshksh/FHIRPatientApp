import { GENE_LOOKUP_METHOD } from "./types";
import type { GeneResultsByGene, PgxData, RecommendationRow } from "./types";

// DELIBERATE DEMO SIMPLIFICATION — not a bug, do not "fix" without reading
// this comment first. Dev notes §3: clopidogrel is the one drug in this
// dataset where population isn't just "general" — it has three genuinely
// different clinical-context recommendations (CVI ACS PCI / CVI non-ACS
// non-PCI / NVI) for the same CYP2C19 phenotype, and it has NO "general"
// row at all, so it can't share the fallback every other drug uses. Real
// clopidogrel guidance depends on that clinical context (recent stent vs.
// not, acute coronary syndrome vs. not) — collapsing it to one hardcoded
// population is a real loss of clinical nuance, accepted here to keep the
// demo's scope tight, per the notes' recommended option. NVI (the broadest
// non-cardiac-intervention context) was chosen as that one population.
// Every other demo drug is "general" only and is unaffected by this.
// `populationOverrides` still lets a caller pick a different clinical
// context per drug (the notes' "if I had more time" option) without
// changing this default.
const DEFAULT_POPULATION_BY_DRUG: Record<string, string> = {
  clopidogrel: "NVI",
};

function resolvePopulation(drug: string, populationOverrides?: Record<string, string>): string {
  return populationOverrides?.[drug] ?? DEFAULT_POPULATION_BY_DRUG[drug] ?? "general";
}

// Per gene, the value to compare a lookupkey entry against: CYP2D6/DPYD key
// on the numeric activity-score string, every other gene keys on the
// phenotype label. This is the #1 documented gotcha (dev notes §2) — get
// it backwards and CYP2D6/DPYD rules silently never match.
function matchValueForGene(gene: string, results: GeneResultsByGene): string | undefined {
  const result = results[gene];
  if (!result || !result.matched) return undefined;

  return GENE_LOOKUP_METHOD[gene] === "ACTIVITY_SCORE" ? result.activityScore : result.phenotype;
}

// Step 2 — drug + resolved gene results -> matching CPIC recommendation, or
// null if none apply. Every key in a multi-gene lookupkey must match (not
// just one) — this is what makes the TPMT+NUDT15 azathioprine rule work.
// Rows with classification "No Recommendation" are filtered out and never
// returned — CPIC explicitly declining to give guidance is "no match", not
// a recommendation to surface.
export function getRecommendation(
  data: PgxData,
  drug: string,
  geneResults: GeneResultsByGene,
  populationOverrides?: Record<string, string>,
): RecommendationRow | null {
  const rows = data.recommendationsByDrug.get(drug) ?? [];
  const population = resolvePopulation(drug, populationOverrides);

  for (const row of rows) {
    if (row.population !== population) continue;
    if (row.classification === "No Recommendation") continue;

    const keyEntries = Object.entries(row.lookupKey);
    const allMatch = keyEntries.every(
      ([gene, value]) => matchValueForGene(gene, geneResults) === value,
    );

    if (allMatch) return row;
  }

  return null;
}
