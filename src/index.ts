import { serve } from "bun";
import index from "./index.html";
import {
  initDb,
  seedAdminIfNeeded,
  getUserByUsername,
  getUserById,
  setUserPasswordHash,
  toPublicUser,
} from "./db";
import {
  clearSessionCookie,
  createSessionForUser,
  getCurrentUser,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from "./auth";
import { fhirFetch } from "./fhirServer";
import { adminRoutes } from "./adminRoutes";
import { pgxRoutes } from "./pgxRoutes";

await initDb();
await seedAdminIfNeeded();

const server = serve({
  port: process.env.PORT || 3000,
  hostname: "0.0.0.0",
  routes: {
    "/login": {
      POST: async req => {
        const body = await req.json().catch(() => null);
        const username =
          typeof body?.username === "string" ? body.username.trim() : "";
        const password = typeof body?.password === "string" ? body.password : "";

        if (!username || !password) {
          return Response.json(
            { error: "Username and password are required" },
            { status: 400 },
          );
        }

        const user = await getUserByUsername(username);
        if (!user || !user.is_active) {
          return Response.json(
            { error: "Invalid username or password" },
            { status: 401 },
          );
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
          return Response.json(
            { error: "Invalid username or password" },
            { status: 401 },
          );
        }

        const session = await createSessionForUser(user.id);
        setSessionCookie(req, session.id);
        return Response.json({ user: toPublicUser(user) });
      },
    },

    "/logout": {
      POST: async req => {
        await clearSessionCookie(req);
        return Response.json({ ok: true });
      },
    },

    "/api/me": {
      GET: async req => {
        const user = await getCurrentUser(req);
        return Response.json({ user });
      },
    },

    "/api/change-password": {
      POST: async req => {
        const auth = await requireAuth(req);
        if (auth instanceof Response) return auth;

        const body = await req.json().catch(() => null);
        const currentPassword =
          typeof body?.currentPassword === "string" ? body.currentPassword : "";
        const newPassword =
          typeof body?.newPassword === "string" ? body.newPassword : "";

        if (!currentPassword || !newPassword) {
          return Response.json(
            { error: "Current and new password are required" },
            { status: 400 },
          );
        }

        if (newPassword.length < 8) {
          return Response.json(
            { error: "New password must be at least 8 characters" },
            { status: 400 },
          );
        }

        const user = await getUserById(auth.id);
        if (!user) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        const valid = await verifyPassword(currentPassword, user.password_hash);
        if (!valid) {
          return Response.json(
            { error: "Current password is incorrect" },
            { status: 401 },
          );
        }

        const passwordHash = await hashPassword(newPassword);
        await setUserPasswordHash(user.id, passwordHash);

        return Response.json({ ok: true });
      },
    },

    ...adminRoutes,
    ...pgxRoutes,

    "/fhir/*": async req => {
      const auth = await requireAuth(req);
      if (auth instanceof Response) return auth;

      const url = new URL(req.url);
      const targetPath = url.pathname.replace("/fhir", "") + url.search;

      const proxied = await fhirFetch(targetPath, {
        method: req.method,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : await req.text(),
      });

      const body = await proxied.text();
      return new Response(body, {
        status: proxied.status,
        headers: { "Content-Type": "application/fhir+json" },
      });
    },

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
