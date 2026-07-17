import type { Bundle, Encounter } from "fhir/r4";
import { extractFhirError } from "./fhirError";

export type { Bundle, Encounter };

// Base FHIR Encounter has no native SOAP fields, so subjective/objective/
// assessment/plan are recorded as extensions in this namespace.
const SOAP_EXTENSION_BASE = "http://fhirpatientapp.local/fhir/StructureDefinition/soap";

export type SoapNote = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

const SOAP_SECTIONS: (keyof SoapNote)[] = [
  "subjective",
  "objective",
  "assessment",
  "plan",
];

export type CreateEncounterParams = {
  patientId: string;
  practitionerId: string;
  appointmentId?: string;
  soap: SoapNote;
};

export function extractSoapNote(encounter: Encounter): SoapNote {
  const get = (section: keyof SoapNote) =>
    encounter.extension?.find(ext => ext.url === `${SOAP_EXTENSION_BASE}-${section}`)
      ?.valueString ?? "";

  return {
    subjective: get("subjective"),
    objective: get("objective"),
    assessment: get("assessment"),
    plan: get("plan"),
  };
}

export function encounterDate(encounter: Encounter): string | undefined {
  return encounter.period?.start ?? encounter.meta?.lastUpdated;
}

export async function createEncounter(
  params: CreateEncounterParams,
): Promise<Encounter> {
  const extension = SOAP_SECTIONS.filter(
    section => params.soap[section]?.trim(),
  ).map(section => ({
    url: `${SOAP_EXTENSION_BASE}-${section}`,
    valueString: params.soap[section].trim(),
  }));

  const resource: Encounter = {
    resourceType: "Encounter",
    status: "finished",
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "AMB",
      display: "ambulatory",
    },
    subject: { reference: `Patient/${params.patientId}` },
    participant: [
      { individual: { reference: `Practitioner/${params.practitionerId}` } },
    ],
    period: { start: new Date().toISOString() },
    ...(params.appointmentId
      ? { appointment: [{ reference: `Appointment/${params.appointmentId}` }] }
      : {}),
    extension,
  };

  const res = await fetch("/fhir/Encounter", {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(resource),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to save encounter (${res.status})`,
    );
  }

  return res.json();
}

export async function listEncountersForPatient(
  patientId: string,
): Promise<Encounter[]> {
  const res = await fetch(
    `/fhir/Encounter?patient=${patientId}&_count=50&_sort=-date`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load encounters (${res.status})`);
  }
  const bundle: Bundle<Encounter> = await res.json();
  return bundle.entry?.flatMap(e => (e.resource ? [e.resource] : [])) ?? [];
}
