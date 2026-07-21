import type {
  Condition,
  Medication,
  MedicationRequest,
  Observation,
} from "fhir/r4";
import { extractFhirError } from "./fhirError";

export type { Condition, Medication, MedicationRequest, Observation };

export type VitalRow = {
  date: string;
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  temperature?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  height?: number;
  weight?: number;
  bmi?: number;
};

const VITAL_CODES = {
  systolic: "8480-6",
  diastolic: "8462-4",
  heartRate: "8867-4",
  temperature: "8310-5",
  respiratoryRate: "9279-1",
  oxygenSaturation: "59408-5",
  height: "8302-2",
  weight: "29463-7",
  bmi: "39156-5",
} as const;

function findValue(observation: Observation, code: string): number | undefined {
  if (observation.code?.coding?.some(c => c.code === code)) {
    return observation.valueQuantity?.value;
  }
  for (const component of observation.component ?? []) {
    if (component.code?.coding?.some(c => c.code === code)) {
      return component.valueQuantity?.value;
    }
  }
  return undefined;
}

export function parseVitalRows(observations: Observation[]): VitalRow[] {
  const rowsByDate = new Map<string, VitalRow>();

  for (const observation of observations) {
    const date = observation.effectiveDateTime ?? observation.issued;
    if (!date) continue;

    let row = rowsByDate.get(date);
    if (!row) {
      row = { date };
      rowsByDate.set(date, row);
    }

    const systolic = findValue(observation, VITAL_CODES.systolic);
    const diastolic = findValue(observation, VITAL_CODES.diastolic);
    const heartRate = findValue(observation, VITAL_CODES.heartRate);
    const temperature = findValue(observation, VITAL_CODES.temperature);
    const respiratoryRate = findValue(observation, VITAL_CODES.respiratoryRate);
    const oxygenSaturation = findValue(observation, VITAL_CODES.oxygenSaturation);
    const height = findValue(observation, VITAL_CODES.height);
    const weight = findValue(observation, VITAL_CODES.weight);
    const bmi = findValue(observation, VITAL_CODES.bmi);

    if (systolic !== undefined) row.systolic = systolic;
    if (diastolic !== undefined) row.diastolic = diastolic;
    if (heartRate !== undefined) row.heartRate = heartRate;
    if (temperature !== undefined) row.temperature = temperature;
    if (respiratoryRate !== undefined) row.respiratoryRate = respiratoryRate;
    if (oxygenSaturation !== undefined) row.oxygenSaturation = oxygenSaturation;
    if (height !== undefined) row.height = height;
    if (weight !== undefined) row.weight = weight;
    if (bmi !== undefined) row.bmi = bmi;
  }

  return [...rowsByDate.values()].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

type VitalKey = keyof typeof VITAL_CODES;

const VITAL_UNITS: Record<VitalKey, { unit: string; ucumCode: string }> = {
  systolic: { unit: "mmHg", ucumCode: "mm[Hg]" },
  diastolic: { unit: "mmHg", ucumCode: "mm[Hg]" },
  heartRate: { unit: "/min", ucumCode: "/min" },
  temperature: { unit: "Cel", ucumCode: "Cel" },
  respiratoryRate: { unit: "/min", ucumCode: "/min" },
  oxygenSaturation: { unit: "%", ucumCode: "%" },
  height: { unit: "cm", ucumCode: "cm" },
  weight: { unit: "kg", ucumCode: "kg" },
  bmi: { unit: "kg/m2", ucumCode: "kg/m2" },
};

const VITAL_LABELS: Record<VitalKey, string> = {
  systolic: "Systolic blood pressure",
  diastolic: "Diastolic blood pressure",
  heartRate: "Heart rate",
  temperature: "Body temperature",
  respiratoryRate: "Respiratory rate",
  oxygenSaturation: "Oxygen saturation",
  height: "Body height",
  weight: "Body weight",
  bmi: "Body mass index",
};

export type VitalsFormValues = {
  effectiveDateTime: string;
  systolic: string;
  diastolic: string;
  heartRate: string;
  temperature: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  height: string;
  weight: string;
};

export function calculateBmi(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function buildVitalObservation(
  patientId: string,
  effectiveDateTime: string,
  key: VitalKey,
  value: number,
): Observation {
  const { unit, ucumCode } = VITAL_UNITS[key];
  return {
    resourceType: "Observation",
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "vital-signs",
            display: "Vital Signs",
          },
        ],
      },
    ],
    code: {
      coding: [{ system: "http://loinc.org", code: VITAL_CODES[key], display: VITAL_LABELS[key] }],
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value,
      unit,
      system: "http://unitsofmeasure.org",
      code: ucumCode,
    },
  };
}

// Every entered vital becomes its own standalone Observation (no BP "panel"
// with components) — mirrors how VITAL_CODES/findValue above already read
// standalone-coded Observations. BMI is derived, not form-entered: it's
// added only when both height and weight are present in this submission,
// using the same calculateBmi the form's live preview uses.
export function buildVitalObservations(
  patientId: string,
  values: VitalsFormValues,
): Observation[] {
  const effectiveDateTime = new Date(values.effectiveDateTime).toISOString();
  const observations: Observation[] = [];

  const entries: [VitalKey, string][] = [
    ["systolic", values.systolic],
    ["diastolic", values.diastolic],
    ["heartRate", values.heartRate],
    ["temperature", values.temperature],
    ["respiratoryRate", values.respiratoryRate],
    ["oxygenSaturation", values.oxygenSaturation],
    ["height", values.height],
    ["weight", values.weight],
  ];

  for (const [key, raw] of entries) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    observations.push(buildVitalObservation(patientId, effectiveDateTime, key, Number(trimmed)));
  }

  const heightRaw = values.height.trim();
  const weightRaw = values.weight.trim();
  if (heightRaw && weightRaw) {
    const bmi = calculateBmi(Number(heightRaw), Number(weightRaw));
    observations.push(buildVitalObservation(patientId, effectiveDateTime, "bmi", bmi));
  }

  return observations;
}

// Loops individual creates rather than a FHIR transaction bundle: there is
// no existing batch/transaction usage anywhere in this app — every other
// create/update (Condition, MedicationRequest, Patient) is a single-resource
// POST/PUT through the /fhir/{resourceType}[/{id}] proxy route, which has no
// bare-/fhir bundle endpoint wired up. If a submission fails partway, the
// Observations already created earlier in the loop remain created.
export async function createVitalObservations(
  patientId: string,
  values: VitalsFormValues,
): Promise<Observation[]> {
  const toCreate = buildVitalObservations(patientId, values);
  const created: Observation[] = [];

  for (const observation of toCreate) {
    const res = await fetch("/fhir/Observation", {
      method: "POST",
      headers: { "Content-Type": "application/fhir+json" },
      body: JSON.stringify(observation),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        extractFhirError(errBody) ?? `Failed to save vitals (${res.status})`,
      );
    }

    created.push(await res.json());
  }

  return created;
}

export function getMedicationDisplay(
  request: MedicationRequest,
  medicationsById: Map<string, Medication>,
): string {
  if (request.medicationReference?.reference) {
    const id = request.medicationReference.reference.split("/").pop();
    const medication = id ? medicationsById.get(id) : undefined;
    if (medication) {
      return (
        medication.code?.text ??
        medication.code?.coding?.[0]?.display ??
        "Unknown medication"
      );
    }
    return request.medicationReference.display ?? "Unknown medication";
  }

  return (
    request.medicationCodeableConcept?.text ??
    request.medicationCodeableConcept?.coding?.[0]?.display ??
    "Unknown medication"
  );
}

export function getMedicationStartDate(request: MedicationRequest): string | undefined {
  return (
    request.authoredOn ??
    request.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.start
  );
}

export function getMedicationEndDate(request: MedicationRequest): string | undefined {
  return request.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.end;
}

export type MedicationRequestFormValues = {
  codeText: string;
  startDate: string;
  endDate: string;
};

export function formValuesToMedicationRequest(
  patientId: string,
  values: MedicationRequestFormValues,
): MedicationRequest {
  const boundsPeriod: { start: string; end?: string } = { start: values.startDate };
  if (values.endDate.trim()) {
    boundsPeriod.end = values.endDate;
  }

  return {
    resourceType: "MedicationRequest",
    status: "active",
    intent: "order",
    subject: { reference: `Patient/${patientId}` },
    medicationCodeableConcept: { text: values.codeText.trim() },
    dosageInstruction: [
      {
        timing: {
          repeat: { boundsPeriod },
        },
      },
    ],
  };
}

export async function createMedicationRequest(
  patientId: string,
  values: MedicationRequestFormValues,
): Promise<MedicationRequest> {
  const resource = formValuesToMedicationRequest(patientId, values);

  const res = await fetch("/fhir/MedicationRequest", {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(resource),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to save medication (${res.status})`,
    );
  }

  return res.json();
}

// http://terminology.hl7.org/CodeSystem/condition-clinical
export type ClinicalStatusCode = "active" | "resolved" | "inactive";

const CLINICAL_STATUS_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/condition-clinical";

export type ConditionFormValues = {
  codeText: string;
  clinicalStatus: ClinicalStatusCode;
  onsetDate: string;
};

export const CLINICAL_STATUS_OPTIONS: { value: ClinicalStatusCode; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "inactive", label: "Inactive" },
];

export function getConditionClinicalStatus(condition: Condition): string {
  return condition.clinicalStatus?.coding?.[0]?.code ?? "unknown";
}

function isHistoricalStatus(status: string): boolean {
  return status === "resolved" || status === "inactive";
}

export type GroupedConditions = {
  active: Condition[];
  historical: Condition[];
};

// Single source of truth for the Active/Historical split — used both to
// render the initially-fetched list and to place a newly-created condition,
// so the two can never disagree about which group a status belongs to.
export function groupConditionsByStatus(conditions: Condition[]): GroupedConditions {
  const active: Condition[] = [];
  const historical: Condition[] = [];

  for (const condition of conditions) {
    if (isHistoricalStatus(getConditionClinicalStatus(condition))) {
      historical.push(condition);
    } else {
      active.push(condition);
    }
  }

  return { active, historical };
}

export function formValuesToCondition(
  patientId: string,
  values: ConditionFormValues,
): Condition {
  return {
    resourceType: "Condition",
    subject: { reference: `Patient/${patientId}` },
    clinicalStatus: {
      coding: [
        {
          system: CLINICAL_STATUS_SYSTEM,
          code: values.clinicalStatus,
        },
      ],
    },
    code: { text: values.codeText.trim() },
    onsetDateTime: values.onsetDate,
  };
}

export async function createCondition(
  patientId: string,
  values: ConditionFormValues,
): Promise<Condition> {
  const resource = formValuesToCondition(patientId, values);

  const res = await fetch("/fhir/Condition", {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(resource),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to save condition (${res.status})`,
    );
  }

  return res.json();
}

async function getCondition(id: string): Promise<Condition> {
  const res = await fetch(`/fhir/Condition/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to load condition (${res.status})`);
  }
  return res.json();
}

// Refetches the condition first so the update carries the server's current
// meta.versionId/fields rather than a possibly-stale copy held in UI state,
// then PUTs back the full resource with only clinicalStatus.coding changed —
// same CLINICAL_STATUS_SYSTEM/codes used by createCondition, not redefined.
export async function updateConditionStatus(
  id: string,
  status: ClinicalStatusCode,
): Promise<Condition> {
  const current = await getCondition(id);

  const updated: Condition = {
    ...current,
    clinicalStatus: {
      ...current.clinicalStatus,
      coding: [
        {
          system: CLINICAL_STATUS_SYSTEM,
          code: status,
        },
      ],
    },
  };

  const res = await fetch(`/fhir/Condition/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(updated),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to update condition (${res.status})`,
    );
  }

  return res.json();
}
