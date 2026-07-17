export type UserRole = "admin" | "practitioner";

export type PublicUser = {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  fhir_practitioner_id: string | null;
  is_active: number;
  created_at: string;
};

export async function fetchCurrentUser(): Promise<PublicUser | null> {
  const res = await fetch("/api/me");
  if (!res.ok) return null;
  const body = await res.json();
  return body.user ?? null;
}

export async function logout(): Promise<void> {
  await fetch("/logout", { method: "POST" });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch("/api/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
}
