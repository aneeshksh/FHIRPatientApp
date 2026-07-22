import type { PublicUser, UserRole } from "./authClient";

export type { PublicUser, UserRole };

export type PractitionerSummary = {
  id: number;
  fullName: string;
  fhirPractitionerId: string;
};

export type CreateUserValues = {
  username: string;
  fullName: string;
  password: string;
  role: UserRole;
};

async function parseOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export async function fetchUsers(): Promise<PublicUser[]> {
  const res = await fetch("/api/admin/users");
  const body = await parseOrThrow<{ users: PublicUser[] }>(res);
  return body.users;
}

export async function createAdminUser(
  values: CreateUserValues,
): Promise<PublicUser> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const body = await parseOrThrow<{ user: PublicUser }>(res);
  return body.user;
}

export async function setUserActive(
  id: number,
  isActive: boolean,
): Promise<PublicUser> {
  const res = await fetch(`/api/admin/users/${id}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  const body = await parseOrThrow<{ user: PublicUser }>(res);
  return body.user;
}

export async function fetchPractitioners(): Promise<PractitionerSummary[]> {
  const res = await fetch("/api/admin/practitioners");
  const body = await parseOrThrow<{ practitioners: PractitionerSummary[] }>(res);
  return body.practitioners;
}

// `practitionerId: null` unassigns the patient (clears generalPractitioner
// entirely server-side) rather than assigning them to anyone.
export async function reassignPatientPractitioner(
  patientId: string,
  practitionerId: string | null,
): Promise<void> {
  const res = await fetch(`/api/admin/patients/${patientId}/practitioner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ practitionerId }),
  });
  await parseOrThrow(res);
}

export type CascadeResourceType = "Observation" | "Condition" | "MedicationRequest";

export type CascadeDeleteFailure = {
  resourceType: CascadeResourceType | "Patient";
  stage: "search" | "delete";
  id?: string;
  message: string;
};

export type CascadeDeleteResult = {
  patientId: string;
  deletedCounts: Record<CascadeResourceType, number>;
  patientDeleted: boolean;
  failure?: CascadeDeleteFailure;
};

// Read-only — for the pre-delete confirmation modal to show "this will
// also delete N vitals, N conditions, N medications" before the admin
// commits to anything. A normal parseOrThrow is fine here (unlike
// deletePatientCascade below): a failed preview has no partial state to
// report, it's just an error.
export async function fetchCascadeDeletePreview(
  patientId: string,
): Promise<Record<CascadeResourceType, number>> {
  const res = await fetch(`/api/admin/patients/${patientId}/cascade-preview`);
  const body = await parseOrThrow<{ counts: Record<CascadeResourceType, number> }>(res);
  return body.counts;
}

// Unlike the other admin actions here, a non-2xx response is still a
// meaningful result (a partial cascade failure), not just an error to
// throw away — the caller needs `result` either way to show what did and
// didn't get deleted, so this doesn't use parseOrThrow.
export async function deletePatientCascade(patientId: string): Promise<CascadeDeleteResult> {
  const res = await fetch(`/api/admin/patients/${patientId}`, { method: "DELETE" });
  const body = await res.json().catch(() => null);

  if (!body?.result) {
    throw new Error(body?.error ?? `Delete request failed (${res.status})`);
  }

  return body.result as CascadeDeleteResult;
}

export type DemoPatientKey = "A" | "B" | "C";

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

// Same reasoning as deletePatientCascade above — a non-2xx response is
// still a meaningful partial result (some of the 3 demo patients may have
// reset fine even if one didn't), not just an error to discard.
export async function resetDemoData(): Promise<ResetDemoDataResult> {
  const res = await fetch("/api/admin/reset-demo-data", { method: "POST" });
  const body = await res.json().catch(() => null);

  if (!body?.result) {
    throw new Error(body?.error ?? `Reset request failed (${res.status})`);
  }

  return body.result as ResetDemoDataResult;
}
