import { describe, expect, test } from "bun:test";
import type { Patient } from "fhir/r4";
import {
  DEMO_PATIENT_SPECS,
  resetDemoData,
  type DemoPatientResetClient,
  type DemoPatientSpec,
} from "./demoPatients";
import type { CascadeDeleteResult } from "./patientCascadeDelete";

// A fake DemoPatientResetClient so resetDemoData's orchestration (search,
// delete-every-match, create, create-medications, independent per-patient
// failure handling) can be exercised without a live FHIR server.
function makeFakeClient(options: {
  existingByKey?: Partial<Record<string, Patient[]>>;
  failFindFor?: string; // spec.label
  failCascadeDeleteFor?: string; // Patient.id
  failCreateFor?: string; // spec.label
  failMedicationFor?: { patientId: string; codeText: string };
}) {
  const created: { spec: DemoPatientSpec; generalPractitionerId: string | null }[] = [];
  const deletedIds: string[] = [];
  const medicationsCreated: { patientId: string; codeText: string }[] = [];
  const nextIdByKey: Record<string, number> = {};

  const client: DemoPatientResetClient = {
    async findExistingMatches(spec) {
      if (spec.label === options.failFindFor) {
        throw new Error(`search failed for ${spec.label}`);
      }
      return options.existingByKey?.[spec.key] ?? [];
    },

    async cascadeDeletePatient(patientId): Promise<CascadeDeleteResult> {
      if (patientId === options.failCascadeDeleteFor) {
        return {
          patientId,
          deletedCounts: { Observation: 0, Condition: 0, MedicationRequest: 0 },
          patientDeleted: false,
          failure: {
            resourceType: "Observation",
            stage: "delete",
            id: "obs-x",
            message: "simulated delete failure",
          },
        };
      }
      deletedIds.push(patientId);
      return {
        patientId,
        deletedCounts: { Observation: 1, Condition: 0, MedicationRequest: 0 },
        patientDeleted: true,
      };
    },

    async createPatient(spec, generalPractitionerId) {
      if (spec.label === options.failCreateFor) {
        throw new Error(`create failed for ${spec.label}`);
      }
      created.push({ spec, generalPractitionerId });
      nextIdByKey[spec.key] = (nextIdByKey[spec.key] ?? 0) + 1;
      const id = `new-${spec.key}-${nextIdByKey[spec.key]}`;
      return { resourceType: "Patient", id };
    },

    async createMedication(patientId, codeText) {
      if (
        options.failMedicationFor &&
        options.failMedicationFor.patientId === patientId &&
        options.failMedicationFor.codeText === codeText
      ) {
        throw new Error(`medication failed: ${codeText}`);
      }
      medicationsCreated.push({ patientId, codeText });
    },
  };

  return { client, created, deletedIds, medicationsCreated };
}

describe("resetDemoData — happy path", () => {
  test("recreates all 3 demo patients with the right medications, none existing beforehand", async () => {
    const { client, created, medicationsCreated } = makeFakeClient({});

    const result = await resetDemoData(client, null);

    expect(result.allSucceeded).toBe(true);
    expect(result.outcomes).toHaveLength(3);

    const [a, b, c] = result.outcomes;
    expect(a!.key).toBe("A");
    expect(a!.succeeded).toBe(true);
    expect(a!.medicationsExpected).toBe(0);
    expect(a!.medicationsCreated).toBe(0);
    expect(a!.deletedExistingCount).toBe(0);

    expect(b!.key).toBe("B");
    expect(b!.medicationsExpected).toBe(2);
    expect(b!.medicationsCreated).toBe(2);

    expect(c!.key).toBe("C");
    expect(c!.medicationsExpected).toBe(2);
    expect(c!.medicationsCreated).toBe(2);

    expect(created).toHaveLength(3);
    expect(medicationsCreated.map(m => m.codeText)).toEqual([
      "Clopidogrel 75mg",
      "Simvastatin 40mg",
      "Azathioprine 50mg",
      "Codeine 30mg",
    ]);
  });

  test("passes the given generalPractitionerId through to patient creation, or omits it when null", async () => {
    const { client, created } = makeFakeClient({});

    await resetDemoData(client, "practitioner-123");
    expect(created.every(c => c.generalPractitionerId === "practitioner-123")).toBe(true);

    const { client: client2, created: created2 } = makeFakeClient({});
    await resetDemoData(client2, null);
    expect(created2.every(c => c.generalPractitionerId === null)).toBe(true);
  });
});

describe("resetDemoData — idempotency: deletes every existing match before recreating", () => {
  test("a patient with duplicate existing matches has all of them deleted, not just one", async () => {
    const existingB: Patient[] = [
      { resourceType: "Patient", id: "dup-b-1" },
      { resourceType: "Patient", id: "dup-b-2" },
    ];
    const { client, deletedIds } = makeFakeClient({ existingByKey: { B: existingB } });

    const result = await resetDemoData(client, null);

    const bOutcome = result.outcomes.find(o => o.key === "B")!;
    expect(bOutcome.succeeded).toBe(true);
    expect(bOutcome.deletedExistingCount).toBe(2);
    expect(deletedIds).toEqual(["dup-b-1", "dup-b-2"]);
  });

  test("a patient with no existing match deletes nothing and still succeeds", async () => {
    const { client } = makeFakeClient({});
    const result = await resetDemoData(client, null);
    expect(result.outcomes.every(o => o.deletedExistingCount === 0)).toBe(true);
    expect(result.allSucceeded).toBe(true);
  });
});

describe("resetDemoData — per-patient independent failure handling", () => {
  test("a search failure for one patient doesn't stop the other two from being reset", async () => {
    const { client } = makeFakeClient({ failFindFor: "Demo Patient B - Cardiac Risk" });

    const result = await resetDemoData(client, null);

    expect(result.allSucceeded).toBe(false);
    const [a, b, c] = result.outcomes;
    expect(a!.succeeded).toBe(true);
    expect(b!.succeeded).toBe(false);
    expect(b!.error).toContain("search failed");
    expect(c!.succeeded).toBe(true);
  });

  test("a cascade-delete failure on an existing match stops that patient before recreating it, but doesn't block the others", async () => {
    const existingA: Patient[] = [{ resourceType: "Patient", id: "stuck-a" }];
    const { client, created } = makeFakeClient({
      existingByKey: { A: existingA },
      failCascadeDeleteFor: "stuck-a",
    });

    const result = await resetDemoData(client, null);

    const aOutcome = result.outcomes.find(o => o.key === "A")!;
    expect(aOutcome.succeeded).toBe(false);
    expect(aOutcome.newPatientId).toBeUndefined();
    expect(aOutcome.error).toContain("stuck-a");
    expect(aOutcome.error).toContain("Observation");
    // A was never recreated because its existing duplicate couldn't be
    // deleted first.
    expect(created.some(c => c.spec.key === "A")).toBe(false);

    expect(result.outcomes.find(o => o.key === "B")!.succeeded).toBe(true);
    expect(result.outcomes.find(o => o.key === "C")!.succeeded).toBe(true);
  });

  test("a patient-creation failure reports no newPatientId and skips medications entirely", async () => {
    const { client, medicationsCreated } = makeFakeClient({
      failCreateFor: "Demo Patient B - Cardiac Risk",
    });

    const result = await resetDemoData(client, null);

    const bOutcome = result.outcomes.find(o => o.key === "B")!;
    expect(bOutcome.succeeded).toBe(false);
    expect(bOutcome.newPatientId).toBeUndefined();
    expect(bOutcome.medicationsCreated).toBe(0);
    expect(medicationsCreated.some(m => m.codeText.includes("Clopidogrel"))).toBe(false);
  });

  test("a medication failure stops at that medication but still reports the new patient id and partial medication count", async () => {
    // B's patient id is deterministic in the fake client: "new-B-<n>". Since
    // this is the only reset running, it'll be "new-B-1".
    const { client } = makeFakeClient({
      failMedicationFor: { patientId: "new-B-1", codeText: "Simvastatin 40mg" },
    });

    const result = await resetDemoData(client, null);

    const bOutcome = result.outcomes.find(o => o.key === "B")!;
    expect(bOutcome.succeeded).toBe(false);
    expect(bOutcome.newPatientId).toBe("new-B-1");
    expect(bOutcome.medicationsCreated).toBe(1); // Clopidogrel succeeded, Simvastatin didn't
    expect(bOutcome.medicationsExpected).toBe(2);
    expect(bOutcome.error).toContain("Simvastatin 40mg");

    // C, processed after B, is unaffected.
    expect(result.outcomes.find(o => o.key === "C")!.succeeded).toBe(true);
  });
});

describe("DEMO_PATIENT_SPECS — sanity checks against dev notes §4", () => {
  test("has exactly A, B, C in that order, with the exact ticket-specified display names", () => {
    expect(DEMO_PATIENT_SPECS.map(s => s.key)).toEqual(["A", "B", "C"]);
    expect(DEMO_PATIENT_SPECS.map(s => s.label)).toEqual([
      "Demo Patient A - Normal",
      "Demo Patient B - Cardiac Risk",
      "Demo Patient C - Thiopurine + Opioid Risk",
    ]);
  });

  test("only B and C carry medications; A (baseline, no flags) carries none", () => {
    const byKey = Object.fromEntries(DEMO_PATIENT_SPECS.map(s => [s.key, s.medications]));
    expect(byKey.A).toEqual([]);
    expect(byKey.B).toEqual(["Clopidogrel 75mg", "Simvastatin 40mg"]);
    expect(byKey.C).toEqual(["Azathioprine 50mg", "Codeine 30mg"]);
  });
});
