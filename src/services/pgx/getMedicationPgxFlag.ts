import { resolveGene } from "./resolveGene";
import { getRecommendation } from "./getRecommendation";
import type { GeneResultsByGene, PgxData } from "./types";

export type MedicationPgxFlag = {
  drug: string;
  classification: string;
  recommendationText: string;
};

// Medication names are free text (ANE-29/30 — no RxNorm lookup yet), so
// matching is by substring against the drug names that actually have CPIC
// recommendation data loaded. `recommendationsByDrug`'s keys ARE the "one
// of the 5 CPIC demo drugs" allowlist — demo_recommendations.csv only has
// rows for those 5 — so there's no second, separately-maintained drug list
// that could drift out of sync with the CSV.
function findAffectedDrugName(data: PgxData, medicationText: string): string | null {
  const lower = medicationText.toLowerCase();
  for (const drugName of data.recommendationsByDrug.keys()) {
    if (lower.includes(drugName.toLowerCase())) return drugName;
  }
  return null;
}

// demo_gene_drug_pairs.csv join (dev notes §1/§5 Step 3's "affected drugs"
// join, run in the drug -> genes direction since this is medication-driven).
// Confirmed against the data that azathioprine has BOTH TPMT and NUDT15
// rows here — dropping either would silently break the multi-gene rule.
function genesForDrug(data: PgxData, drugName: string): string[] {
  const genes = new Set<string>();
  for (const pair of data.geneDrugPairs) {
    if (pair.drugName === drugName && pair.usedForRecommendation === "t") {
      genes.add(pair.genesymbol);
    }
  }
  return [...genes];
}

// For one medication's free-text name: find which (if any) of the 5 CPIC
// demo drugs it is, resolve the patient's diplotype for every gene
// affecting that drug (Step 1), then run the Step 2 matcher. Returns null
// — not a "no interaction" flag — whenever there's nothing to show: not a
// demo drug, no gene-drug pairs, patient missing a diplotype for a
// required gene, unmatched diplotype, or no recommendation row (including
// "No Recommendation" rows, already filtered inside getRecommendation).
export function getMedicationPgxFlag(
  data: PgxData,
  patientDiplotypes: Record<string, string>,
  medicationText: string,
): MedicationPgxFlag | null {
  const drug = findAffectedDrugName(data, medicationText);
  if (!drug) return null;

  const genes = genesForDrug(data, drug);
  if (genes.length === 0) return null;

  const geneResults: GeneResultsByGene = {};
  for (const gene of genes) {
    const diplotype = patientDiplotypes[gene];
    if (diplotype) {
      geneResults[gene] = resolveGene(data, gene, diplotype);
    }
  }

  const recommendation = getRecommendation(data, drug, geneResults);
  if (!recommendation) return null;

  return {
    drug,
    classification: recommendation.classification,
    recommendationText: recommendation.drugRecommendation,
  };
}
