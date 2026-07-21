export { loadPgxData } from "./data";
export { resolveGene } from "./resolveGene";
export { getRecommendation } from "./getRecommendation";
export { getMedicationPgxFlag } from "./getMedicationPgxFlag";
export { getPatientPgxDiplotypes, PGX_DIPLOTYPES_EXTENSION_URL } from "./patientDiplotypes";
export { GENE_LOOKUP_METHOD } from "./types";
export type {
  DiplotypeRow,
  GeneDrugPairRow,
  GeneResolution,
  GeneResultsByGene,
  LookupMethod,
  PgxData,
  RecommendationRow,
} from "./types";
export type { MedicationPgxFlag } from "./getMedicationPgxFlag";
