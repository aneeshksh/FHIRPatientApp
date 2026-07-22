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
import {
  clearPatientGeneralPractitioner,
  findOrCreatePractitionerResource,
  setPatientGeneralPractitioner,
} from "./fhirServer";
import {
  cascadeDeletePatient,
  liveFhirCascadeClient,
  previewCascadeDelete,
} from "./services/patientCascadeDelete";
import { liveDemoPatientResetClient, resetDemoData } from "./services/demoPatients";

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
          // Reuses an existing Practitioner tagged with this username
          // (findPractitionerByUsername, keyed off the local-username
          // identifier) instead of always creating a new one — see
          // fhirServer.ts for why name-matching alone isn't reliable here.
          const practitioner = await findOrCreatePractitionerResource(username, fullName);
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

  // Cascade delete, surfaced in AdminPatients.tsx (the existing admin
  // "Patients" tab) alongside practitioner reassignment — not a separate
  // page. Gated by the same requireRole("admin") every other
  // /api/admin/* route here uses. Known gap: no audit log of who deleted
  // what — add one before any real production use.
  "/api/admin/patients/:id/cascade-preview": {
    // Read-only — reports what a delete WOULD remove (per-type counts),
    // for the admin confirmation modal to show before committing. Never
    // deletes anything itself.
    async GET(req: BunRequest<"/api/admin/patients/:id/cascade-preview">) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const patientId = req.params.id;
      try {
        const counts = await previewCascadeDelete(liveFhirCascadeClient, patientId);
        return Response.json({ counts });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Failed to preview delete" },
          { status: 502 },
        );
      }
    },
  },

  "/api/admin/patients/:id": {
    async DELETE(req: BunRequest<"/api/admin/patients/:id">) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const patientId = req.params.id;
      const result = await cascadeDeletePatient(liveFhirCascadeClient, patientId);

      return Response.json({ result }, { status: result.patientDeleted ? 200 : 502 });
    },
  },

  // Resets Demo Patients A/B/C (docs/pgx_demo_dev_notes.md §4) to a known-
  // clean state for pre-demo prep — surfaced as the "Reset Demo Data"
  // button in AdminPatients.tsx, not a CLI script. Assigns the 3 recreated
  // patients to whichever Practitioner the CURRENT admin session is linked
  // to (usually none — admin accounts don't carry a fhir_practitioner_id,
  // see db.ts — in which case they're left unassigned), same as any other
  // patient-create path (fhirPatient.ts's formValuesToPatient).
  "/api/admin/reset-demo-data": {
    async POST(req: BunRequest) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const result = await resetDemoData(liveDemoPatientResetClient, auth.fhir_practitioner_id);
      return Response.json({ result }, { status: result.allSucceeded ? 200 : 502 });
    },
  },

  "/api/admin/patients/:id/practitioner": {
    // practitionerId is either a non-empty string (assign) or explicitly
    // `null` (unassign — clears generalPractitioner entirely rather than
    // leaving it pointing at a stale/orphaned Practitioner reference).
    // Missing the field, or any other shape, is a 400 — `null` must be
    // sent on purpose, not just implied by omission.
    async PATCH(req: BunRequest<"/api/admin/patients/:id/practitioner">) {
      const auth = await requireRole(req, "admin");
      if (auth instanceof Response) return auth;

      const patientId = req.params.id;
      const body = await req.json().catch(() => null);

      if (!body || !("practitionerId" in body)) {
        return Response.json(
          { error: "practitionerId is required (a non-empty string id, or null to unassign)" },
          { status: 400 },
        );
      }

      const { practitionerId } = body;

      if (practitionerId !== null && (typeof practitionerId !== "string" || !practitionerId)) {
        return Response.json(
          { error: "practitionerId must be a non-empty string id, or null to unassign" },
          { status: 400 },
        );
      }

      try {
        const patient =
          practitionerId === null
            ? await clearPatientGeneralPractitioner(patientId)
            : await setPatientGeneralPractitioner(patientId, practitionerId);
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
