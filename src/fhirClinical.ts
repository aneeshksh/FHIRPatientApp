import type {
  Condition,
  Medication,
  MedicationRequest,
  Observation,
} from "fhir/r4";

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
