import type { BunRequest } from "bun";
import {
  createSession,
  deleteSession,
  getSession,
  getUserById,
  toPublicUser,
  type PublicUser,
  type UserRole,
} from "./db";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const isProduction = process.env.NODE_ENV === "production";

export function getCurrentUser(req: BunRequest): PublicUser | null {
  const sessionId = req.cookies.get(SESSION_COOKIE);
  if (!sessionId) return null;

  const session = getSession(sessionId);
  if (!session) return null;

  const user = getUserById(session.user_id);
  if (!user || !user.is_active) return null;

  return toPublicUser(user);
}

export function setSessionCookie(req: BunRequest, sessionId: string): void {
  // `secure` is only enabled in production (Cloud Run serves over HTTPS) —
  // browsers drop Secure cookies over plain http, which would break local dev.
  req.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(req: BunRequest): void {
  const sessionId = req.cookies.get(SESSION_COOKIE);
  if (sessionId) deleteSession(sessionId);
  req.cookies.delete(SESSION_COOKIE, { path: "/" });
}

function unauthorized(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Returns the authenticated user, or a Response to short-circuit the route. */
export function requireAuth(req: BunRequest): PublicUser | Response {
  const user = getCurrentUser(req);
  if (!user) return unauthorized("Not authenticated", 401);
  return user;
}

/** Returns the authenticated user if they have `role`, or a Response to short-circuit the route. */
export function requireRole(
  req: BunRequest,
  role: UserRole,
): PublicUser | Response {
  const result = requireAuth(req);
  if (result instanceof Response) return result;
  if (result.role !== role) return unauthorized("Forbidden", 403);
  return result;
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function createSessionForUser(userId: number) {
  return createSession(userId);
}
