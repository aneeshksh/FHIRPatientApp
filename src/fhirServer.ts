import type { Bundle, Patient, Practitioner, Resource } from "fhir/r4";
import { FHIR_BASE_URL, FHIR_BEARER_TOKEN } from "./fhirConfig";
import { extractFhirError } from "./fhirError";

// Business identifier tying a Practitioner resource back to the local
// `users.username` that owns it. Search-by-name is unreliable for this
// (case sensitivity, given/family splitting — confirmed by the "Meredith
// Grey" vs bare "meredith" variants found in production), so this is the
// only thing findPractitionerByUsername/findOrCreatePractitionerResource
// match on.
export const LOCAL_USERNAME_IDENTIFIER_SYSTEM =
  "http://yourapp.org/fhir/identifier/local-username";

/**
 * Direct (non-proxied) call to the live FHIR server, for server-initiated
 * writes that need to happen alongside local sqlite changes (e.g. creating a
 * Practitioner resource as part of admin user creation). Browser-initiated
 * FHIR calls should go through the `/fhir/*` route instead, which wraps this
 * same function.
 *
 * `path` may be a relative path (prefixed with FHIR_BASE_URL as usual) or a
 * full URL — the latter lets callers follow a Bundle's `link.relation ===
 * "next"` URL as-is (the FHIR spec has servers return that as an absolute
 * URL back to themselves), which patientCascadeDelete.ts's pagination needs.
 */
export async function fhirFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = /^https?:\/\//i.test(path) ? path : `${FHIR_BASE_URL}${path}`;
  return fetch(url, {
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
  username: string,
  fullName: string,
): Promise<Practitioner> {
  const { given, family } = splitFullName(fullName);

  const resource: Practitioner = {
    resourceType: "Practitioner",
    active: true,
    identifier: [{ system: LOCAL_USERNAME_IDENTIFIER_SYSTEM, value: username }],
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

// Looks up a Practitioner by the local-username identifier rather than by
// name — returns null (not throw) when there's no match, since "no
// existing practitioner for this username" is the normal, expected case on
// first-ever creation, not an error.
export async function findPractitionerByUsername(
  username: string,
): Promise<Practitioner | null> {
  const params = new URLSearchParams({
    identifier: `${LOCAL_USERNAME_IDENTIFIER_SYSTEM}|${username}`,
  });

  const res = await fhirFetch(`/Practitioner?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to search for existing practitioner (${res.status})`);
  }

  const bundle: Bundle<Practitioner> = await res.json();
  return bundle.entry?.find(e => e.resource)?.resource ?? null;
}

// Reuses a Practitioner already tagged with this username instead of
// always minting a new one. Local MySQL is resettable in dev but the
// Medblocks FHIR server persists forever, so without this, recreating the
// same user after a DB reset created a brand-new orphaned Practitioner
// every time — confirmed in production: 4 separate "Meredith" Practitioner
// resources on the server, only 1 ever linked to an active user row.
export async function findOrCreatePractitionerResource(
  username: string,
  fullName: string,
): Promise<Practitioner> {
  const existing = await findPractitionerByUsername(username);
  if (existing) return existing;
  return createPractitionerResource(username, fullName);
}

// Follows Bundle.link "next" (via fhirFetch's absolute-URL support) to
// collect every entry across every page, for callers that need a complete
// result set rather than one page of it — e.g.
// cleanup-orphaned-practitioners.ts listing all Practitioners, or all
// Patients referencing one.
export async function searchAllResources<T extends Resource>(path: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = path;

  while (next) {
    const res = await fhirFetch(next);
    if (!res.ok) {
      throw new Error(`Search failed for ${next} (${res.status})`);
    }

    const bundle: Bundle<T> = await res.json();
    for (const entry of bundle.entry ?? []) {
      if (entry.resource) results.push(entry.resource);
    }

    next = bundle.link?.find(l => l.relation === "next")?.url ?? null;
  }

  return results;
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

// Removes generalPractitioner entirely (the field itself, not an empty
// array) — used by the admin "Unassigned" reassignment option so a patient
// whose practitioner reference pointed at an orphaned/deleted Practitioner
// doesn't end up with a stale reference left behind.
export async function clearPatientGeneralPractitioner(id: string): Promise<Patient> {
  const patient = await getPatientResource(id);
  const { generalPractitioner: _drop, ...withoutGeneralPractitioner } = patient;

  const res = await fhirFetch(`/Patient/${id}`, {
    method: "PUT",
    body: JSON.stringify(withoutGeneralPractitioner),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to unassign patient (${res.status})`,
    );
  }

  return res.json();
}
