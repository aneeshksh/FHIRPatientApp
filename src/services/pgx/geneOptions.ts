import { PGX_GENES } from "./types";
import type { PgxData } from "./types";

// Dropdown options must come from the actual diplotype strings the matcher
// resolves against, not a hardcoded guess (ANE-35) — this is what makes it
// structurally impossible for a practitioner to enter a diplotype in the
// wrong allele order (e.g. "*4/*1" instead of the table's "*1/*4"; see
// docs/pgx_demo_dev_notes.md §5) through the dropdown path, since only
// values already present in demo_diplotype_to_phenotype.csv are offered.
export function getGeneOptions(data: PgxData): Record<string, string[]> {
  const optionsByGene: Record<string, string[]> = {};

  for (const gene of PGX_GENES) {
    const byDiplotype = data.diplotypesByGene.get(gene);
    optionsByGene[gene] = byDiplotype ? [...byDiplotype.keys()].sort() : [];
  }

  return optionsByGene;
}
