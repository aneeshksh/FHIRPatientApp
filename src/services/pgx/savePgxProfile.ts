import type { Patient } from "fhir/r4";
import { updatePatientResource } from "../../fhirPatient";
import { setPatientPgxDiplotypes } from "./patientDiplotypes";

// ANE-35: the only write path for the pgx-diplotypes extension outside the
// one-time ANE-31 seed script. Reuses updatePatientResource (fhirPatient.ts)
// — the same PUT-a-full-Patient-resource path every other patient update
// goes through — rather than a new PUT call, so this is just "replace the
// extension array, then update the Patient like normal."
export async function savePgxProfile(
  patient: Patient,
  diplotypes: Record<string, string>,
): Promise<Patient> {
  const updated = setPatientPgxDiplotypes(patient, diplotypes);
  return updatePatientResource(updated);
}
