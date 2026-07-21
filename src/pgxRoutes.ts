import type { BunRequest } from "bun";
import { requireAuth } from "./auth";
import { loadPgxData } from "./services/pgx/data";
import { getMedicationPgxFlag } from "./services/pgx/getMedicationPgxFlag";

type MedicationInput = { id: string; text: string };

function isMedicationInput(value: unknown): value is MedicationInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MedicationInput).id === "string" &&
    typeof (value as MedicationInput).text === "string"
  );
}

// The pgx/ service module loads its CSVs via Bun.file, so this matching
// logic can only run server-side — this route is what the browser-bundled
// PgxInteractionsSection component calls into, sending the patient's
// already-fetched diplotypes + medication display text (both already on
// the client from the existing Patient/MedicationRequest fetch) rather than
// having the server refetch FHIR data it doesn't need to.
export const pgxRoutes = {
  "/api/pgx/interactions": {
    async POST(req: BunRequest) {
      const auth = await requireAuth(req);
      if (auth instanceof Response) return auth;

      const body = await req.json().catch(() => null);
      const diplotypes = body?.diplotypes;
      const medications = body?.medications;

      if (
        !diplotypes ||
        typeof diplotypes !== "object" ||
        Array.isArray(diplotypes) ||
        !Array.isArray(medications) ||
        !medications.every(isMedicationInput)
      ) {
        return Response.json(
          { error: "diplotypes (object) and medications ({id, text}[]) are required" },
          { status: 400 },
        );
      }

      const data = await loadPgxData();

      const flags = (medications as MedicationInput[]).flatMap(medication => {
        const flag = getMedicationPgxFlag(data, diplotypes, medication.text);
        return flag ? [{ medicationId: medication.id, ...flag }] : [];
      });

      return Response.json({ flags });
    },
  },
};
