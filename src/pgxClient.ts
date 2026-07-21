export type MedicationPgxFlag = {
  medicationId: string;
  drug: string;
  classification: string;
  recommendationText: string;
};

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
