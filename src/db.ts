import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH ?? "app.db";

export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'practitioner')),
    fhir_practitioner_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  );
`);

export type UserRole = "admin" | "practitioner";

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  fhir_practitioner_id: string | null;
  is_active: number;
  created_at: string;
};

export type PublicUser = Omit<UserRow, "password_hash">;

export function toPublicUser(user: UserRow): PublicUser {
  const { password_hash, ...rest } = user;
  return rest;
}

export function getUserByUsername(username: string): UserRow | null {
  return (
    (db
      .query("SELECT * FROM users WHERE username = ?")
      .get(username) as UserRow | undefined) ?? null
  );
}

export function getUserById(id: number): UserRow | null {
  return (
    (db.query("SELECT * FROM users WHERE id = ?").get(id) as
      | UserRow
      | undefined) ?? null
  );
}

export function listUsers(): UserRow[] {
  return db
    .query("SELECT * FROM users ORDER BY created_at ASC")
    .all() as UserRow[];
}

export function createUser(params: {
  username: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  fhirPractitionerId?: string | null;
}): UserRow {
  const result = db
    .query(
      `INSERT INTO users (username, password_hash, full_name, role, fhir_practitioner_id)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .get(
      params.username,
      params.passwordHash,
      params.fullName,
      params.role,
      params.fhirPractitionerId ?? null,
    ) as UserRow;
  return result;
}

export function setUserActive(id: number, isActive: boolean): void {
  db.query("UPDATE users SET is_active = ? WHERE id = ?").run(
    isActive ? 1 : 0,
    id,
  );
}

export function setUserPasswordHash(id: number, passwordHash: string): void {
  db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(
    passwordHash,
    id,
  );
}

export function setUserFhirPractitionerId(
  id: number,
  fhirPractitionerId: string,
): void {
  db.query("UPDATE users SET fhir_practitioner_id = ? WHERE id = ?").run(
    fhirPractitionerId,
    id,
  );
}

export type SessionRow = {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSession(userId: number): SessionRow {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(id, userId, expiresAt);
  return { id, user_id: userId, created_at: new Date().toISOString(), expires_at: expiresAt };
}

export function getSession(id: string): SessionRow | null {
  const session = db
    .query("SELECT * FROM sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    deleteSession(id);
    return null;
  }
  return session;
}

export function deleteSession(id: string): void {
  db.query("DELETE FROM sessions WHERE id = ?").run(id);
}

const DEFAULT_ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

export async function seedAdminIfNeeded(): Promise<void> {
  const count = db.query("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };
  if (count.count > 0) return;

  const passwordHash = await Bun.password.hash(DEFAULT_ADMIN_PASSWORD);
  createUser({
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash,
    fullName: "Administrator",
    role: "admin",
  });

  console.log(
    `Seeded default admin user — username: "${DEFAULT_ADMIN_USERNAME}", password: "${DEFAULT_ADMIN_PASSWORD}". Change this after first login.`,
  );
}
