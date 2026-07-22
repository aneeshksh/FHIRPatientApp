import type { BunRequest } from "bun";
import { hashPassword, requireRole } from "./auth";
import {
  createUser,
  getUserById,
  getUserByUsername,
  listUsers,
  setUserActive,
  toPublicUser,
  type UserRole,
} from "./db";
import { createPractitionerResource, setPatientGeneralPractitioner } from "./fhirServer";
import { cascadeDeletePatient, liveFhirCascadeClient } from "./services/patientCascadeDelete";

function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "practitioner";
}

export const adminRoutes = {
  "/api/admin/users": {
    async GET(req: BunRequest) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      return Response.json({ users: (await listUsers()).map(toPublicUser) });
    },

    async POST(req: BunRequest) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const body = await req.json().catch(() => null);
      const username =
        typeof body?.username === "string" ? body.username.trim() : "";
      const fullName =
        typeof body?.fullName === "string" ? body.fullName.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";
      const role = body?.role;

      if (!username || !fullName || !password || !isUserRole(role)) {
        return Response.json(
          { error: "username, fullName, password, and a valid role are required" },
          { status: 400 },
        );
      }

      if (password.length < 8) {
        return Response.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 },
        );
      }

      if (await getUserByUsername(username)) {
        return Response.json({ error: "Username already exists" }, { status: 409 });
      }

      let fhirPractitionerId: string | null = null;
      if (role === "practitioner") {
        try {
          const practitioner = await createPractitionerResource(fullName);
          if (!practitioner.id) {
            throw new Error("FHIR server did not return a practitioner id");
          }
          fhirPractitionerId = practitioner.id;
        } catch (err) {
          return Response.json(
            {
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to create FHIR Practitioner resource",
            },
            { status: 502 },
          );
        }
      }

      const passwordHash = await hashPassword(password);
      const user = await createUser({
        username,
        passwordHash,
        fullName,
        role,
        fhirPractitionerId,
      });

      return Response.json({ user: toPublicUser(user) }, { status: 201 });
    },
  },

  "/api/admin/users/:id/active": {
    async PATCH(req: BunRequest<"/api/admin/users/:id/active">) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const id = Number(req.params.id);
      const body = await req.json().catch(() => null);
      const isActive = body?.isActive;

      if (!Number.isInteger(id) || typeof isActive !== "boolean") {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      const existing = await getUserById(id);
      if (!existing) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      await setUserActive(id, isActive);
      return Response.json({ user: toPublicUser((await getUserById(id))!) });
    },
  },

  "/api/admin/practitioners": {
    async GET(req: BunRequest) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const practitioners = (await listUsers())
        .filter(
          (u): u is typeof u & { fhir_practitioner_id: string } =>
            u.role === "practitioner" && u.is_active === 1 && Boolean(u.fhir_practitioner_id),
        )
        .map(u => ({
          id: u.id,
          fullName: u.full_name,
          fhirPractitionerId: u.fhir_practitioner_id,
        }));

      return Response.json({ practitioners });
    },
  },

  // ANE-?? cascade-delete admin page. Deliberately gated by the same
  // requireRole("admin") every other /api/admin/* route already uses — the
  // ticket for this route said not to build new auth for it, which this
  // doesn't (nothing new here, just reusing the existing session-role
  // check). Known gap: no audit log of who deleted what, no rate limiting,
  // and the /admin/patients page itself is unlisted rather than actually
  // access-controlled at the UI level — add proper admin-only routing
  // before any real production use if this page needs to outlive the demo
  // data cleanup it was built for.
  "/api/admin/patients/:id": {
    async DELETE(req: BunRequest<"/api/admin/patients/:id">) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const patientId = req.params.id;
      const result = await cascadeDeletePatient(liveFhirCascadeClient, patientId);

      return Response.json({ result }, { status: result.patientDeleted ? 200 : 502 });
    },
  },

  "/api/admin/patients/:id/practitioner": {
    async PATCH(req: BunRequest<"/api/admin/patients/:id/practitioner">) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const patientId = req.params.id;
      const body = await req.json().catch(() => null);
      const practitionerId =
        typeof body?.practitionerId === "string" ? body.practitionerId : "";

      if (!practitionerId) {
        return Response.json({ error: "practitionerId is required" }, { status: 400 });
      }

      try {
        const patient = await setPatientGeneralPractitioner(patientId, practitionerId);
        return Response.json({ patient });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Failed to reassign patient" },
          { status: 502 },
        );
      }
    },
  },
};
