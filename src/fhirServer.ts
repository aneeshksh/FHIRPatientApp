import type { Patient, Practitioner } from "fhir/r4";
import { FHIR_BASE_URL, FHIR_BEARER_TOKEN } from "./fhirConfig";
import { extractFhirError } from "./fhirError";

/**
 * Direct (non-proxied) call to the live FHIR server, for server-initiated
 * writes that need to happen alongside local sqlite changes (e.g. creating a
 * Practitioner resource as part of admin user creation). Browser-initiated
 * FHIR calls should go through the `/fhir/*` route instead, which wraps this
 * same function.
 */
export async function fhirFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${FHIR_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${FHIR_BEARER_TOKEN}`,
      Accept: "application/fhir+json",
      "Content-Type": "application/fhir+json",
      ...init.headers,
    },
  });
}

function splitFullName(fullName: string): { given?: string[]; family?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { given: parts };
  return { given: parts.slice(0, -1), family: parts[parts.length - 1] };
}

export async function createPractitionerResource(
  fullName: string,
): Promise<Practitioner> {
  const { given, family } = splitFullName(fullName);

  const resource: Practitioner = {
    resourceType: "Practitioner",
    active: true,
    name: [
      {
        use: "official",
        ...(given ? { given } : {}),
        ...(family ? { family } : {}),
      },
    ],
  };

  const res = await fhirFetch("/Practitioner", {
    method: "POST",
    body: JSON.stringify(resource),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to create practitioner (${res.status})`,
    );
  }

  return res.json();
}

export async function getPatientResource(id: string): Promise<Patient> {
  const res = await fhirFetch(`/Patient/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to load patient (${res.status})`);
  }
  return res.json();
}

export async function setPatientGeneralPractitioner(
  id: string,
  practitionerId: string,
): Promise<Patient> {
  const patient = await getPatientResource(id);
  patient.generalPractitioner = [
    { reference: `Practitioner/${practitionerId}` },
  ];

  const res = await fhirFetch(`/Patient/${id}`, {
    method: "PUT",
    body: JSON.stringify(patient),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to reassign patient (${res.status})`,
    );
  }

  return res.json();
}
