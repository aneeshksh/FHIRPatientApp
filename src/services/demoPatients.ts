import type { MedicationRequest, Patient } from "fhir/r4";
import { formatName } from "../fhirPatient";
import { formValuesToMedicationRequest } from "../fhirClinical";
import { extractFhirError } from "../fhirError";
import { fhirFetch, searchAllResources } from "../fhirServer";
import { setPatientPgxDiplotypes } from "./pgx/patientDiplotypes";
import { DEMO_PATIENT_B_PGX_PROFILE } from "./pgx/demoProfiles";
import { cascadeDeletePatient, liveFhirCascadeClient } from "./patientCascadeDelete";

export type DemoPatientKey = "A" | "B" | "C";

export type DemoPatientSpec = {
  key: DemoPatientKey;
  label: string; // exact display name, docs/pgx_demo_dev_notes.md §4
  given: string[];
  family: string;
  gender: NonNullable<Patient["gender"]>;
  birthDate: string;
  pgxResults: Record<string, string>;
  medications: string[]; // display text, created in this order
};

// Demo Patients A/B/C — docs/pgx_demo_dev_notes.md §4. Single source of
// truth for these specs: ANE-31's seed script (scripts/seed-demo-patients.ts)
// and the admin panel's "Reset Demo Data" button (adminRoutes.ts) both
// import this instead of each hardcoding their own copy of the names,
// diplotypes, or medications.
export const DEMO_PATIENT_SPECS: DemoPatientSpec[] = [
  {
    key: "A",
    label: "Demo Patient A - Normal",
    given: ["Demo"],
    family: "Patient A - Normal",
    gender: "female",
    birthDate: "1985-04-12",
    pgxResults: {
      CYP2C19: "*1/*1",
      CYP2D6: "*1/*1",
      SLCO1B1: "*1/*1",
      TPMT: "*1/*1",
      NUDT15: "*1/*1",
      DPYD: "Reference/Reference",
    },
    medications: [], // baseline story — no flags anywhere, so no medications
  },
  {
    key: "B",
    label: "Demo Patient B - Cardiac Risk",
    given: ["Demo"],
    family: "Patient B - Cardiac Risk",
    gender: "male",
    birthDate: "1962-09-03",
    // Shared with the ANE-36 "Load Demo Data" button — see pgx/demoProfiles.ts.
    pgxResults: DEMO_PATIENT_B_PGX_PROFILE,
    medications: ["Clopidogrel 75mg", "Simvastatin 40mg"],
  },
  {
    key: "C",
    label: "Demo Patient C - Thiopurine + Opioid Risk",
    given: ["Demo"],
    family: "Patient C - Thiopurine + Opioid Risk",
    gender: "male",
    birthDate: "1990-01-20",
    pgxResults: {
      CYP2C19: "*1/*1",
      CYP2D6: "*4/*4",
      SLCO1B1: "*1/*1",
      TPMT: "*3A/*3A",
      NUDT15: "*1/*1",
      DPYD: "Reference/Reference",
    },
    medications: ["Azathioprine 50mg", "Codeine 30mg"],
  },
];

export type DemoPatientResetOutcome = {
  key: DemoPatientKey;
  label: string;
  deletedExistingCount: number;
  newPatientId?: string;
  medicationsCreated: number;
  medicationsExpected: number;
  succeeded: boolean;
  error?: string;
};

export type ResetDemoDataResult = {
  outcomes: DemoPatientResetOutcome[];
  allSucceeded: boolean;
};

// Search + delete + create are injected rather than called directly
// against fhirFetch, so resetOnePatient/resetDemoData's orchestration
// (idempotent re-search, per-patient independent failure handling,
// stop-on-first-medication-failure) can be unit tested against a fake
// client without a live FHIR server — same reasoning as
// patientCascadeDelete.ts's FhirCascadeClient.
export type DemoPatientResetClient = {
  findExistingMatches(spec: DemoPatientSpec): Promise<Patient[]>;
  cascadeDeletePatient(patientId: string): ReturnType<typeof cascadeDeletePatient>;
  createPatient(spec: DemoPatientSpec, generalPractitionerId: string | null): Promise<Patient>;
  createMedication(patientId: string, codeText: string): Promise<void>;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function resetOnePatient(
  client: DemoPatientResetClient,
  spec: DemoPatientSpec,
  generalPractitionerId: string | null,
): Promise<DemoPatientResetOutcome> {
  const outcome: DemoPatientResetOutcome = {
    key: spec.key,
    label: spec.label,
    deletedExistingCount: 0,
    medicationsCreated: 0,
    medicationsExpected: spec.medications.length,
    succeeded: false,
  };

  let existing: Patient[];
  try {
    existing = await client.findExistingMatches(spec);
  } catch (err) {
    outcome.error = `Failed to search for existing "${spec.label}": ${errorMessage(err)}`;
    return outcome;
  }

  // Delete every existing match, not just one — a reset must reach a clean
  // single-instance state even if a prior run left duplicates behind.
  for (const match of existing) {
    if (!match.id) continue;

    const result = await client.cascadeDeletePatient(match.id);
    if (!result.patientDeleted) {
      const failure = result.failure;
      outcome.error =
        `Failed to delete existing "${spec.label}" (Patient/${match.id}) — stopped at ` +
        `${failure?.resourceType}${failure?.id ? ` ${failure.id}` : ""} during ${failure?.stage}: ` +
        `${failure?.message}`;
      return outcome;
    }
    outcome.deletedExistingCount += 1;
  }

  let created: Patient;
  try {
    created = await client.createPatient(spec, generalPractitionerId);
  } catch (err) {
    outcome.error = `Failed to recreate "${spec.label}": ${errorMessage(err)}`;
    return outcome;
  }

  if (!created.id) {
    outcome.error = `FHIR server did not return an id when recreating "${spec.label}"`;
    return outcome;
  }
  outcome.newPatientId = created.id;

  for (const codeText of spec.medications) {
    try {
      await client.createMedication(created.id, codeText);
      outcome.medicationsCreated += 1;
    } catch (err) {
      outcome.error =
        `"${spec.label}" was recreated (Patient/${created.id}) but medication "${codeText}" ` +
        `failed: ${errorMessage(err)}`;
      return outcome;
    }
  }

  outcome.succeeded = true;
  return outcome;
}

// Resets Demo Patients A/B/C to a known-clean state: for each, deletes
// every existing match (via cascadeDeletePatient — the same function the
// per-patient admin delete uses: Observation/Condition/MedicationRequest,
// then Patient), then recreates it fresh with its pgx-diplotypes extension
// and demo medications. Each of the 3 patients is handled independently —
// a failure on one doesn't stop the other two from being attempted, so the
// result always reflects the true end state of all three rather than
// aborting the whole reset over one problem.
//
// Idempotent: every patient is looked up by exact name on every call, never
// assumed to exist from a previous run, so repeated clicks converge on the
// same clean state instead of accumulating duplicates or erroring out.
export async function resetDemoData(
  client: DemoPatientResetClient,
  generalPractitionerId: string | null,
): Promise<ResetDemoDataResult> {
  const outcomes: DemoPatientResetOutcome[] = [];

  for (const spec of DEMO_PATIENT_SPECS) {
    outcomes.push(await resetOnePatient(client, spec, generalPractitionerId));
  }

  return { outcomes, allSucceeded: outcomes.every(o => o.succeeded) };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Real client — direct (non-proxied) calls to the live FHIR server, same
// pattern fhirServer.ts/patientCascadeDelete.ts already use for other
// server-initiated writes, not the browser's /fhir/* proxy.
export const liveDemoPatientResetClient: DemoPatientResetClient = {
  // FHIR `family` search may be a loose/word match depending on the server,
  // so this narrows down via search then confirms with an exact
  // formatted-name match — a reset must never touch a real patient who
  // merely shares part of a demo patient's family name.
  async findExistingMatches(spec) {
    const params = new URLSearchParams({ family: spec.family, _count: "50" });
    const candidates = await searchAllResources<Patient>(`/Patient?${params}`);
    return candidates.filter(p => formatName(p.name) === spec.label);
  },

  cascadeDeletePatient(patientId) {
    return cascadeDeletePatient(liveFhirCascadeClient, patientId);
  },

  async createPatient(spec, generalPractitionerId) {
    const bare: Patient = {
      resourceType: "Patient",
      name: [{ use: "official", given: spec.given, family: spec.family }],
      gender: spec.gender,
      birthDate: spec.birthDate,
      // Only set when there's an id, never an empty array — same rule
      // fhirPatient.ts's formValuesToPatient uses for a brand-new patient.
      ...(generalPractitionerId
        ? { generalPractitioner: [{ reference: `Practitioner/${generalPractitionerId}` }] }
        : {}),
    };

    const patient = setPatientPgxDiplotypes(bare, spec.pgxResults);

    const res = await fhirFetch("/Patient", {
      method: "POST",
      body: JSON.stringify(patient),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(extractFhirError(body) ?? `Failed to create ${spec.label} (${res.status})`);
    }

    return res.json();
  },

  async createMedication(patientId, codeText) {
    const resource: MedicationRequest = formValuesToMedicationRequest(patientId, {
      codeText,
      startDate: todayIsoDate(),
      endDate: "",
    });

    const res = await fhirFetch("/MedicationRequest", {
      method: "POST",
      body: JSON.stringify(resource),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        extractFhirError(body) ?? `Failed to create medication "${codeText}" (${res.status})`,
      );
    }
  },
};
