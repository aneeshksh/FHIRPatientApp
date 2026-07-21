// The 6 CPIC genes in this demo, split by what `recommendations.lookupkey`
// actually keys on for each — see docs/pgx_demo_dev_notes.md §2/§5.
// CYP2D6/DPYD are the documented gotcha: they match on the numeric
// totalactivityscore string, not the phenotype label.
export type LookupMethod = "PHENOTYPE" | "ACTIVITY_SCORE";

export const GENE_LOOKUP_METHOD: Record<string, LookupMethod> = {
  CYP2C19: "PHENOTYPE",
  SLCO1B1: "PHENOTYPE",
  TPMT: "PHENOTYPE",
  NUDT15: "PHENOTYPE",
  CYP2D6: "ACTIVITY_SCORE",
  DPYD: "ACTIVITY_SCORE",
};

export type DiplotypeRow = {
  genesymbol: string;
  diplotype: string;
  function1: string;
  function2: string;
  totalactivityscore: string;
  phenotype: string;
};

export type RecommendationRow = {
  drugName: string;
  lookupKey: Record<string, string>;
  phenotypes: Record<string, string>;
  classification: string;
  drugRecommendation: string;
  population: string;
};

export type GeneDrugPairRow = {
  genesymbol: string;
  drugName: string;
  cpicLevel: string;
  usedForRecommendation: string;
};

export type PgxData = {
  // Indexed gene -> diplotype -> row, for O(1) Step 1 lookups instead of a
  // linear scan per call (the pseudocode's `diplotype_table[mask]` is
  // illustrative pandas, not a requirement to scan 23k rows per lookup).
  diplotypesByGene: Map<string, Map<string, DiplotypeRow>>;
  recommendationsByDrug: Map<string, RecommendationRow[]>;
  geneDrugPairs: GeneDrugPairRow[];
};

// Step 1 result — explicit matched/unmatched union so an unknown diplotype
// is flagged in the type system rather than returned as null or thrown,
// per dev notes §5 ("flag in UI rather than silently skip").
export type GeneResolution =
  | {
      matched: true;
      gene: string;
      diplotype: string;
      phenotype: string;
      activityScore: string;
    }
  | {
      matched: false;
      gene: string;
      diplotype: string;
      reason: "unknown_diplotype";
    };

export type GeneResultsByGene = Record<string, GeneResolution>;
