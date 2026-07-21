import type { Patient } from "fhir/r4";

// Extension shape from ANE-31 / project brief's PGx Approach section —
// already validated against the live server, used as-is.
export const PGX_DIPLOTYPES_EXTENSION_URL =
  "http://yourapp.org/fhir/StructureDefinition/pgx-diplotypes";

// Deliberately dependency-free (no Bun.file, no other pgx/ module) so this
// can be imported both server-side and directly into browser-bundled React
// components — it's pure JSON parsing over data already on the fetched
// Patient resource, not a CSV-backed lookup.
export function getPatientPgxDiplotypes(patient: Patient): Record<string, string> | null {
  const extension = patient.extension?.find(ext => ext.url === PGX_DIPLOTYPES_EXTENSION_URL);
  if (!extension?.valueString) return null;

  try {
    const parsed = JSON.parse(extension.valueString);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}
