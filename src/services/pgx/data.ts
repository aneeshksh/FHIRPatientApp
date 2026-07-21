import { field, parseCsvRecords } from "./csv";
import type { DiplotypeRow, GeneDrugPairRow, PgxData, RecommendationRow } from "./types";

// The ticket text says these CSVs live in data/, but in this repo they are
// actually in docs/, alongside the dev notes that document them. Pointing
// at the real location rather than the one named in the ticket.
const DIPLOTYPE_CSV_URL = new URL(
  "../../../docs/demo_diplotype_to_phenotype.csv",
  import.meta.url,
);
const RECOMMENDATIONS_CSV_URL = new URL(
  "../../../docs/demo_recommendations.csv",
  import.meta.url,
);
const GENE_DRUG_PAIRS_CSV_URL = new URL(
  "../../../docs/demo_gene_drug_pairs.csv",
  import.meta.url,
);

function parseDiplotypes(text: string): Map<string, Map<string, DiplotypeRow>> {
  const byGene = new Map<string, Map<string, DiplotypeRow>>();

  for (const record of parseCsvRecords(text)) {
    const row: DiplotypeRow = {
      genesymbol: field(record, "genesymbol"),
      diplotype: field(record, "diplotype"),
      function1: field(record, "function1"),
      function2: field(record, "function2"),
      totalactivityscore: field(record, "totalactivityscore"),
      phenotype: field(record, "phenotype"),
    };

    let byDiplotype = byGene.get(row.genesymbol);
    if (!byDiplotype) {
      byDiplotype = new Map();
      byGene.set(row.genesymbol, byDiplotype);
    }

    // First row wins on a duplicate key, matching the pseudocode's
    // `match.iloc[0]` (first match) semantics.
    if (!byDiplotype.has(row.diplotype)) {
      byDiplotype.set(row.diplotype, row);
    }
  }

  return byGene;
}

function parseRecommendations(text: string): Map<string, RecommendationRow[]> {
  const byDrug = new Map<string, RecommendationRow[]>();

  for (const record of parseCsvRecords(text)) {
    const row: RecommendationRow = {
      drugName: field(record, "drug_name"),
      lookupKey: JSON.parse(field(record, "lookupkey")),
      phenotypes: JSON.parse(field(record, "phenotypes")),
      classification: field(record, "classification"),
      drugRecommendation: field(record, "drugrecommendation"),
      // Raw data has a stray trailing space on at least one population
      // value ("CVI ACS PCI "); trim so exact-match comparisons don't
      // silently fail on whitespace no one intended to be meaningful.
      population: field(record, "population").trim(),
    };

    const existing = byDrug.get(row.drugName);
    if (existing) {
      existing.push(row);
    } else {
      byDrug.set(row.drugName, [row]);
    }
  }

  return byDrug;
}

function parseGeneDrugPairs(text: string): GeneDrugPairRow[] {
  return parseCsvRecords(text).map(record => ({
    genesymbol: field(record, "genesymbol"),
    drugName: field(record, "drug_name"),
    cpicLevel: field(record, "cpiclevel"),
    usedForRecommendation: field(record, "usedforrecommendation"),
  }));
}

let cachedPgxData: Promise<PgxData> | null = null;

// Loads and parses all three CSVs once; concurrent first-callers share the
// same in-flight promise so the ~23k-row diplotype file is never parsed
// more than once, even under concurrent requests before the first load
// resolves.
export function loadPgxData(): Promise<PgxData> {
  if (!cachedPgxData) {
    cachedPgxData = (async () => {
      const [diplotypeText, recommendationsText, geneDrugPairsText] = await Promise.all([
        Bun.file(DIPLOTYPE_CSV_URL).text(),
        Bun.file(RECOMMENDATIONS_CSV_URL).text(),
        Bun.file(GENE_DRUG_PAIRS_CSV_URL).text(),
      ]);

      return {
        diplotypesByGene: parseDiplotypes(diplotypeText),
        recommendationsByDrug: parseRecommendations(recommendationsText),
        geneDrugPairs: parseGeneDrugPairs(geneDrugPairsText),
      };
    })();
  }

  return cachedPgxData;
}
