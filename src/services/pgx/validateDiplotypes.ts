// Dependency-free (no Bun.file) so this can run in the browser — it
// validates the "Advanced: paste raw data" JSON path against the same
// gene -> valid-diplotype map the dropdowns are populated from (see
// geneOptions.ts), so a pasted pair can only pass if it's a value the
// dropdowns would themselves have offered. Never trust the advanced path
// just because it bypassed the dropdowns (ANE-35).

export type DiplotypeValidationError = {
  gene: string;
  diplotype: string;
  reason: "unknown_gene" | "unknown_diplotype";
};

export function validateDiplotypesAgainstOptions(
  optionsByGene: Record<string, string[]>,
  candidate: Record<string, string>,
): DiplotypeValidationError[] {
  const errors: DiplotypeValidationError[] = [];

  for (const [gene, diplotype] of Object.entries(candidate)) {
    const options = optionsByGene[gene];
    if (!options) {
      errors.push({ gene, diplotype, reason: "unknown_gene" });
      continue;
    }
    if (!options.includes(diplotype)) {
      errors.push({ gene, diplotype, reason: "unknown_diplotype" });
    }
  }

  return errors;
}

export function isPlainStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(v => typeof v === "string")
  );
}

export function describeDiplotypeErrors(errors: DiplotypeValidationError[]): string {
  return errors
    .map(e =>
      e.reason === "unknown_gene"
        ? `"${e.gene}" is not a recognized gene`
        : `${e.gene}: "${e.diplotype}" is not a recognized diplotype`,
    )
    .join("; ");
}
