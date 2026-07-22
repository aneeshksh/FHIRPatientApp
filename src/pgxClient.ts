export type MedicationPgxFlag = {
  medicationId: string;
  drug: string;
  classification: string;
  recommendationText: string;
};

// ANE-35: the valid per-gene diplotype values, straight from the CSV the
// matcher itself reads — this is what makes the profile form's dropdowns
// (and its advanced-JSON validation) unable to drift from what the matcher
// will actually resolve.
export async function fetchPgxGeneOptions(): Promise<Record<string, string[]>> {
  const res = await fetch("/api/pgx/gene-options");
  if (!res.ok) {
    throw new Error(`Failed to load PGx gene options (${res.status})`);
  }
  const body: { optionsByGene: Record<string, string[]> } = await res.json();
  return body.optionsByGene ?? {};
}

export async function fetchPgxInteractions(
  diplotypes: Record<string, string>,
  medications: { id: string; text: string }[],
): Promise<MedicationPgxFlag[]> {
  if (medications.length === 0) return [];

  const res = await fetch("/api/pgx/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diplotypes, medications }),
  });

  if (!res.ok) {
    throw new Error(`Failed to load PGx interactions (${res.status})`);
  }

  const body: { flags: MedicationPgxFlag[] } = await res.json();
  return body.flags ?? [];
}
