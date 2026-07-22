import type { Bundle } from "fhir/r4";
import { fhirFetch } from "../fhirServer";
import { extractFhirError } from "../fhirError";

// Order matters: every resource type that can reference a Patient must be
// deleted before the Patient itself, or the delete would leave orphaned
// Observation/Condition/MedicationRequest records pointing at a Patient id
// that no longer exists.
export const CASCADE_RESOURCE_TYPES = ["Observation", "Condition", "MedicationRequest"] as const;
export type CascadeResourceType = (typeof CASCADE_RESOURCE_TYPES)[number];

// Search + delete are injected rather than called directly against
// fhirFetch, so the ordering/stop-on-failure logic below can be unit tested
// against a fake client (search-then-delete-then-fail-midway scenarios)
// without needing a live FHIR server.
export type FhirCascadeClient = {
  searchIds(resourceType: CascadeResourceType, patientId: string): Promise<string[]>;
  deleteResource(resourceType: CascadeResourceType | "Patient", id: string): Promise<void>;
};

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Deletes every Observation/Condition/MedicationRequest referencing the
// patient, in that fixed order, then the Patient itself. Stops immediately
// on the first failure (search or delete) rather than continuing past it —
// the caller gets back exactly how many of each type were actually deleted
// before the failure, so the patient is never left silently half-deleted
// without a clear account of what happened.
export async function cascadeDeletePatient(
  client: FhirCascadeClient,
  patientId: string,
): Promise<CascadeDeleteResult> {
  const deletedCounts: Record<CascadeResourceType, number> = {
    Observation: 0,
    Condition: 0,
    MedicationRequest: 0,
  };

  for (const resourceType of CASCADE_RESOURCE_TYPES) {
    let ids: string[];
    try {
      ids = await client.searchIds(resourceType, patientId);
    } catch (err) {
      return {
        patientId,
        deletedCounts,
        patientDeleted: false,
        failure: { resourceType, stage: "search", message: errorMessage(err) },
      };
    }

    for (const id of ids) {
      try {
        await client.deleteResource(resourceType, id);
        deletedCounts[resourceType] += 1;
      } catch (err) {
        return {
          patientId,
          deletedCounts,
          patientDeleted: false,
          failure: { resourceType, stage: "delete", id, message: errorMessage(err) },
        };
      }
    }
  }

  try {
    await client.deleteResource("Patient", patientId);
  } catch (err) {
    return {
      patientId,
      deletedCounts,
      patientDeleted: false,
      failure: { resourceType: "Patient", stage: "delete", id: patientId, message: errorMessage(err) },
    };
  }

  return { patientId, deletedCounts, patientDeleted: true };
}

// Read-only dry run for the admin UI's pre-delete confirmation modal —
// counts what WOULD be deleted without deleting anything, via the exact
// same per-type search cascadeDeletePatient itself uses (same
// FhirCascadeClient, same searchIds), so the preview can never show a
// different set of resources than the ones the real delete acts on
// moments later.
export async function previewCascadeDelete(
  client: FhirCascadeClient,
  patientId: string,
): Promise<Record<CascadeResourceType, number>> {
  const counts = {} as Record<CascadeResourceType, number>;
  for (const resourceType of CASCADE_RESOURCE_TYPES) {
    const ids = await client.searchIds(resourceType, patientId);
    counts[resourceType] = ids.length;
  }
  return counts;
}

// Real client — direct (non-proxied) calls to the live FHIR server, same
// pattern fhirServer.ts already uses for other server-initiated writes
// (createPractitionerResource, setPatientGeneralPractitioner), not the
// browser's /fhir/* proxy.
export const liveFhirCascadeClient: FhirCascadeClient = {
  async searchIds(resourceType, patientId) {
    const ids: string[] = [];
    // `next` starts as a relative path and, from the second page on, becomes
    // whatever absolute URL the server's Bundle.link gave back — fhirFetch
    // handles both (see its comment).
    let next: string | null = `/${resourceType}?subject=Patient/${patientId}&_count=100`;

    while (next) {
      const res = await fhirFetch(next);
      if (!res.ok) {
        throw new Error(`Search for ${resourceType} failed (${res.status})`);
      }

      const bundle: Bundle = await res.json();
      for (const entry of bundle.entry ?? []) {
        if (entry.resource?.id) ids.push(entry.resource.id);
      }

      next = bundle.link?.find(l => l.relation === "next")?.url ?? null;
    }

    return ids;
  },

  async deleteResource(resourceType, id) {
    const res = await fhirFetch(`/${resourceType}/${id}`, { method: "DELETE" });
    // A 404 here means the resource is already gone (e.g. a retry after a
    // partial failure) — treat that as success rather than a new failure.
    if (!res.ok && res.status !== 404) {
      const body = await res.json().catch(() => null);
      throw new Error(
        extractFhirError(body) ?? `Delete of ${resourceType}/${id} failed (${res.status})`,
      );
    }
  },
};
