import type { Bundle, HumanName, Patient } from "fhir/r4";
import { extractFhirError } from "./fhirError";

export type { Bundle, HumanName, Patient };
export { extractFhirError };

export type PatientFormValues = {
  prefix: string;
  given: string;
  family: string;
  birthDate: string;
  gender: string;
  mrn: string;
};

const MRN_SYSTEM = "http://hospital.smarthealthit.org";

export function getOfficialName(names?: HumanName[]): HumanName | undefined {
  return names?.find(n => n.use === "official") ?? names?.[0];
}

export function formatName(names?: HumanName[]): string {
  const official = getOfficialName(names);
  if (!official) return "Unknown";

  const parts = [
    official.prefix?.join(" "),
    official.given?.join(" "),
    official.family,
  ].filter(Boolean);

  return parts.join(" ") || "Unknown";
}

export function getPhone(patient: Patient): string | undefined {
  return patient.telecom?.find(t => t.system === "phone")?.value;
}

export function calculateAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(birthDate + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function formatBirthDateWithAge(birthDate?: string): string {
  const formatted = formatBirthDate(birthDate);
  const age = calculateAge(birthDate);
  return age !== undefined ? `${formatted} (${age}y)` : formatted;
}

export function formatGender(gender?: string): string {
  if (!gender) return "—";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

export function formatBirthDate(birthDate?: string): string {
  if (!birthDate) return "—";
  const date = new Date(birthDate + "T00:00:00");
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getMrnIdentifier(patient?: Patient) {
  return patient?.identifier?.find(
    id =>
      id.type?.text === "Medical Record Number" ||
      id.system?.includes("smarthealthit"),
  );
}

function getMrnValue(patient?: Patient): string | undefined {
  const mrn = getMrnIdentifier(patient);
  if (!mrn?.value) return undefined;
  if (patient?.id && mrn.value === patient.id) return undefined;
  return mrn.value;
}

export function getMrn(patient: Patient): string {
  return getMrnValue(patient) ?? "—";
}

export function patientToFormValues(patient?: Patient): PatientFormValues {
  const official = getOfficialName(patient?.name);
  return {
    prefix: official?.prefix?.[0] ?? "",
    given: official?.given?.join(" ") ?? "",
    family: official?.family ?? "",
    birthDate: patient?.birthDate ?? "",
    gender: patient?.gender ?? "",
    mrn: getMrnValue(patient) ?? "",
  };
}

export function formValuesToPatient(
  values: PatientFormValues,
  existing?: Patient,
  generalPractitionerId?: string,
): Patient {
  const name: HumanName = {
    use: "official",
    family: values.family.trim(),
    given: values.given.trim().split(/\s+/).filter(Boolean),
  };

  if (values.prefix.trim()) {
    name.prefix = [values.prefix.trim()];
  }

  const patient: Patient = existing
    ? { ...existing }
    : { resourceType: "Patient" };

  patient.name = [name];
  patient.gender = (values.gender as Patient["gender"]) || undefined;
  patient.birthDate = values.birthDate || undefined;

  // Only set on create — reassignment to a different practitioner is an
  // admin-only action (see AdminPatients.tsx) and must not be overwritten here.
  if (!existing && generalPractitionerId) {
    patient.generalPractitioner = [
      { reference: `Practitioner/${generalPractitionerId}` },
    ];
  }

  const otherIdentifiers =
    patient.identifier?.filter(
      id =>
        id.type?.text !== "Medical Record Number" &&
        !id.system?.includes("smarthealthit"),
    ) ?? [];

  if (values.mrn.trim()) {
    patient.identifier = [
      ...otherIdentifiers,
      {
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0203",
              code: "MR",
              display: "Medical Record Number",
            },
          ],
          text: "Medical Record Number",
        },
        system: MRN_SYSTEM,
        value: values.mrn.trim(),
      },
    ];
  } else {
    patient.identifier = otherIdentifiers.length ? otherIdentifiers : undefined;
  }

  return patient;
}

export async function listPatientsForPractitioner(
  practitionerId: string,
): Promise<Patient[]> {
  const params = new URLSearchParams({
    "general-practitioner": `Practitioner/${practitionerId}`,
    _count: "200",
  });

  const res = await fetch(`/fhir/Patient?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to load patients (${res.status})`);
  }
  const bundle: Bundle<Patient> = await res.json();
  return bundle.entry?.flatMap(e => (e.resource ? [e.resource] : [])) ?? [];
}

export async function savePatient(
  values: PatientFormValues,
  existing?: Patient,
  generalPractitionerId?: string,
): Promise<Patient> {
  const resource = formValuesToPatient(values, existing, generalPractitionerId);
  const isCreate = !existing?.id;
  const url = isCreate ? "/fhir/Patient" : `/fhir/Patient/${existing.id}`;
  const method = isCreate ? "POST" : "PUT";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(resource),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to save patient (${res.status})`,
    );
  }

  return res.json();
}
