import mysql from "mysql2/promise";

// Cloud Run + Cloud SQL: mount the instance with `--add-cloudsql-instances`
// and set DB_SOCKET_PATH=/cloudsql/PROJECT:REGION:INSTANCE (no proxy needed).
// Local dev: run a local MySQL server, or the Cloud SQL Auth Proxy
// (`cloud-sql-proxy --port 3306 PROJECT:REGION:INSTANCE`), and point
// DB_HOST/DB_PORT at it — both look like a plain TCP MySQL server.
const DB_SOCKET_PATH = process.env.DB_SOCKET_PATH;

export const pool = mysql.createPool({
  ...(DB_SOCKET_PATH
    ? { socketPath: DB_SOCKET_PATH }
    : {
        host: process.env.DB_HOST ?? "127.0.0.1",
        port: Number(process.env.DB_PORT ?? 3306),
      }),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "fhir_patient_app",
  dateStrings: true,
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role ENUM('admin', 'practitioner') NOT NULL,
      fhir_practitioner_id VARCHAR(255),
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

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

export async function getUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const [rows] = await pool.execute(
    "SELECT * FROM users WHERE username = ?",
    [username],
  );
  return ((rows as UserRow[])[0]) ?? null;
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
  return ((rows as UserRow[])[0]) ?? null;
}

export async function listUsers(): Promise<UserRow[]> {
  const [rows] = await pool.query(
    "SELECT * FROM users ORDER BY created_at ASC",
  );
  return rows as UserRow[];
}

export async function createUser(params: {
  username: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  fhirPractitionerId?: string | null;
}): Promise<UserRow> {
  const [result] = await pool.execute(
    `INSERT INTO users (username, password_hash, full_name, role, fhir_practitioner_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.username,
      params.passwordHash,
      params.fullName,
      params.role,
      params.fhirPractitionerId ?? null,
    ],
  );
  const insertId = (result as mysql.ResultSetHeader).insertId;
  return (await getUserById(insertId))!;
}

export async function setUserActive(
  id: number,
  isActive: boolean,
): Promise<void> {
  await pool.execute("UPDATE users SET is_active = ? WHERE id = ?", [
    isActive ? 1 : 0,
    id,
  ]);
}

export async function setUserPasswordHash(
  id: number,
  passwordHash: string,
): Promise<void> {
  await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [
    passwordHash,
    id,
  ]);
}

export async function setUserFhirPractitionerId(
  id: number,
  fhirPractitionerId: string,
): Promise<void> {
  await pool.execute(
    "UPDATE users SET fhir_practitioner_id = ? WHERE id = ?",
    [fhirPractitionerId, id],
  );
}

export type SessionRow = {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function toMysqlDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function createSession(userId: number): Promise<SessionRow> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.execute(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    [id, userId, toMysqlDatetime(expiresAt)],
  );
  return {
    id,
    user_id: userId,
    created_at: toMysqlDatetime(new Date()),
    expires_at: toMysqlDatetime(expiresAt),
  };
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const [rows] = await pool.execute("SELECT * FROM sessions WHERE id = ?", [
    id,
  ]);
  const session = (rows as SessionRow[])[0];
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await deleteSession(id);
    return null;
  }
  return session;
}

export async function deleteSession(id: string): Promise<void> {
  await pool.execute("DELETE FROM sessions WHERE id = ?", [id]);
}

const DEFAULT_ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

export async function seedAdminIfNeeded(): Promise<void> {
  const [rows] = await pool.query("SELECT COUNT(*) as count FROM users");
  const count = (rows as { count: number }[])[0]?.count ?? 0;
  if (count > 0) return;

  const passwordHash = await Bun.password.hash(DEFAULT_ADMIN_PASSWORD);
  await createUser({
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash,
    fullName: "Administrator",
    role: "admin",
  });

  console.log(
    `Seeded default admin user — username: "${DEFAULT_ADMIN_USERNAME}", password: "${DEFAULT_ADMIN_PASSWORD}". Change this after first login.`,
  );
}
