import { describe, expect, test } from "bun:test";
import {
  cascadeDeletePatient,
  previewCascadeDelete,
  type CascadeResourceType,
  type FhirCascadeClient,
} from "./patientCascadeDelete";

// A fake FhirCascadeClient so the ordering/stop-on-failure logic can be
// exercised without a live FHIR server. `idsByType` seeds what searchIds
// returns per resource type; `failOn` lets a test make a specific
// search/delete call throw, to simulate a partial failure mid-cascade.
function makeFakeClient(options: {
  idsByType?: Partial<Record<CascadeResourceType, string[]>>;
  failSearch?: CascadeResourceType;
  failDelete?: { resourceType: CascadeResourceType | "Patient"; id: string };
}): { client: FhirCascadeClient; deleted: { resourceType: string; id: string }[] } {
  const deleted: { resourceType: string; id: string }[] = [];

  const client: FhirCascadeClient = {
    async searchIds(resourceType) {
      if (resourceType === options.failSearch) {
        throw new Error(`search failed for ${resourceType}`);
      }
      return options.idsByType?.[resourceType] ?? [];
    },
    async deleteResource(resourceType, id) {
      if (
        options.failDelete &&
        options.failDelete.resourceType === resourceType &&
        options.failDelete.id === id
      ) {
        throw new Error(`delete failed for ${resourceType}/${id}`);
      }
      deleted.push({ resourceType, id });
    },
  };

  return { client, deleted };
}

describe("cascadeDeletePatient — happy path", () => {
  test("deletes Observations, then Conditions, then MedicationRequests, then the Patient, in that order", async () => {
    const { client, deleted } = makeFakeClient({
      idsByType: {
        Observation: ["obs-1", "obs-2"],
        Condition: ["cond-1"],
        MedicationRequest: ["medreq-1"],
      },
    });

    const result = await cascadeDeletePatient(client, "patient-1");

    expect(result.patientDeleted).toBe(true);
    expect(result.failure).toBeUndefined();
    expect(result.deletedCounts).toEqual({ Observation: 2, Condition: 1, MedicationRequest: 1 });

    // Order: all Observations, then all Conditions, then all
    // MedicationRequests, then the Patient itself, last.
    expect(deleted).toEqual([
      { resourceType: "Observation", id: "obs-1" },
      { resourceType: "Observation", id: "obs-2" },
      { resourceType: "Condition", id: "cond-1" },
      { resourceType: "MedicationRequest", id: "medreq-1" },
      { resourceType: "Patient", id: "patient-1" },
    ]);
  });

  test("a patient with no related resources still gets deleted, with zero counts", async () => {
    const { client } = makeFakeClient({});
    const result = await cascadeDeletePatient(client, "patient-2");

    expect(result.patientDeleted).toBe(true);
    expect(result.deletedCounts).toEqual({ Observation: 0, Condition: 0, MedicationRequest: 0 });
  });
});

describe("cascadeDeletePatient — stops on failure, doesn't continue past it", () => {
  test("a search failure on Condition stops before any Condition/MedicationRequest/Patient delete, but keeps counts from the already-completed Observation stage", async () => {
    const { client, deleted } = makeFakeClient({
      idsByType: { Observation: ["obs-1"] },
      failSearch: "Condition",
    });

    const result = await cascadeDeletePatient(client, "patient-3");

    expect(result.patientDeleted).toBe(false);
    expect(result.deletedCounts).toEqual({ Observation: 1, Condition: 0, MedicationRequest: 0 });
    expect(result.failure).toEqual({
      resourceType: "Condition",
      stage: "search",
      message: "search failed for Condition",
    });
    expect(deleted).toEqual([{ resourceType: "Observation", id: "obs-1" }]);
  });

  test("a delete failure partway through a resource type's list stops immediately — later ids in that same list are never attempted", async () => {
    const { client, deleted } = makeFakeClient({
      idsByType: { Observation: ["obs-1", "obs-2", "obs-3"] },
      failDelete: { resourceType: "Observation", id: "obs-2" },
    });

    const result = await cascadeDeletePatient(client, "patient-4");

    expect(result.patientDeleted).toBe(false);
    expect(result.deletedCounts.Observation).toBe(1); // only obs-1 succeeded
    expect(result.failure).toEqual({
      resourceType: "Observation",
      stage: "delete",
      id: "obs-2",
      message: "delete failed for Observation/obs-2",
    });
    // obs-3 must never be attempted once obs-2 fails.
    expect(deleted).toEqual([{ resourceType: "Observation", id: "obs-1" }]);
  });

  test("if every cascade resource succeeds but the final Patient delete fails, the failure names Patient — not left looking like a resourceType bug", async () => {
    const { client, deleted } = makeFakeClient({
      idsByType: { Observation: ["obs-1"] },
      failDelete: { resourceType: "Patient", id: "patient-5" },
    });

    const result = await cascadeDeletePatient(client, "patient-5");

    expect(result.patientDeleted).toBe(false);
    expect(result.deletedCounts).toEqual({ Observation: 1, Condition: 0, MedicationRequest: 0 });
    expect(result.failure).toEqual({
      resourceType: "Patient",
      stage: "delete",
      id: "patient-5",
      message: "delete failed for Patient/patient-5",
    });
    expect(deleted).toEqual([{ resourceType: "Observation", id: "obs-1" }]);
  });
});

describe("previewCascadeDelete — read-only dry run for the admin confirmation modal", () => {
  test("reports counts per resource type without deleting anything", async () => {
    const { client, deleted } = makeFakeClient({
      idsByType: {
        Observation: ["obs-1", "obs-2"],
        Condition: ["cond-1"],
        MedicationRequest: [],
      },
    });

    const counts = await previewCascadeDelete(client, "patient-6");

    expect(counts).toEqual({ Observation: 2, Condition: 1, MedicationRequest: 0 });
    expect(deleted).toEqual([]); // never calls deleteResource
  });

  test("a patient with nothing referencing it previews as all zeros", async () => {
    const { client } = makeFakeClient({});
    const counts = await previewCascadeDelete(client, "patient-7");
    expect(counts).toEqual({ Observation: 0, Condition: 0, MedicationRequest: 0 });
  });
});
