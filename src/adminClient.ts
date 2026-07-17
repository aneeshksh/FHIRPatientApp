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

export async function reassignPatientPractitioner(
  patientId: string,
  practitionerId: string,
): Promise<void> {
  const res = await fetch(`/api/admin/patients/${patientId}/practitioner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ practitionerId }),
  });
  await parseOrThrow(res);
}
