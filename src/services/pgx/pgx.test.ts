import { beforeAll, describe, expect, test } from "bun:test";
import { loadPgxData } from "./data";
import { resolveGene } from "./resolveGene";
import { getRecommendation } from "./getRecommendation";
import { getMedicationPgxFlag } from "./getMedicationPgxFlag";
import { getPatientPgxDiplotypes } from "./patientDiplotypes";
import type { GeneResultsByGene, PgxData } from "./types";

let data: PgxData;

beforeAll(async () => {
  data = await loadPgxData();
});

describe("dev notes §6 worked examples", () => {
  test("Patient C: TPMT *3A/*3A + NUDT15 *1/*1 -> azathioprine is Strong, alternative nonthiopurine", () => {
    const tpmt = resolveGene(data, "TPMT", "*3A/*3A");
    const nudt15 = resolveGene(data, "NUDT15", "*1/*1");

    expect(tpmt).toMatchObject({ matched: true, phenotype: "Poor Metabolizer" });
    expect(nudt15).toMatchObject({ matched: true, phenotype: "Normal Metabolizer" });

    const geneResults: GeneResultsByGene = { TPMT: tpmt, NUDT15: nudt15 };
    const rec = getRecommendation(data, "azathioprine", geneResults);

    expect(rec).not.toBeNull();
    expect(rec!.classification).toBe("Strong");
    expect(rec!.drugRecommendation.toLowerCase()).toContain(
      "alternative nonthiopurine immunosuppressant",
    );
  });

  test("Patient C: CYP2D6 *4/*4 -> codeine matches on activity score, is Strong, avoid codeine", () => {
    const cyp2d6 = resolveGene(data, "CYP2D6", "*4/*4");

    expect(cyp2d6).toMatchObject({
      matched: true,
      phenotype: "Poor Metabolizer",
      activityScore: "0.0",
    });

    const geneResults: GeneResultsByGene = { CYP2D6: cyp2d6 };
    const rec = getRecommendation(data, "codeine", geneResults);

    expect(rec).not.toBeNull();
    expect(rec!.classification).toBe("Strong");
    expect(rec!.drugRecommendation.toLowerCase()).toContain("avoid codeine");
  });

  test("codeine keys on CYP2D6 activity score, not phenotype text (the #1 documented gotcha)", () => {
    // Same phenotype as the real *4/*4 result ("Poor Metabolizer") but a
    // wrong activity score. If Step 2 matched on phenotype text instead of
    // activity score, this would incorrectly match the "avoid codeine"
    // rule despite the score not being "0.0" — this must return null.
    const phenotypeMatchesButScoreDoesnt: GeneResultsByGene = {
      CYP2D6: {
        matched: true,
        gene: "CYP2D6",
        diplotype: "synthetic",
        phenotype: "Poor Metabolizer",
        activityScore: "999.0",
      },
    };

    expect(getRecommendation(data, "codeine", phenotypeMatchesButScoreDoesnt)).toBeNull();
  });
});

describe("allele-order handling (dev notes §5)", () => {
  test("CYP2D6 *1/*4 and *4/*1 resolve to the same phenotype and activity score", () => {
    const forward = resolveGene(data, "CYP2D6", "*1/*4");
    const reversed = resolveGene(data, "CYP2D6", "*4/*1");

    expect(forward.matched).toBe(true);
    expect(reversed.matched).toBe(true);
    if (forward.matched && reversed.matched) {
      expect(reversed.phenotype).toBe(forward.phenotype);
      expect(reversed.activityScore).toBe(forward.activityScore);
    }
  });
});

describe("unmatched diplotypes", () => {
  test("an unknown diplotype returns an explicit unmatched result, not null and not a thrown exception", () => {
    expect(() => resolveGene(data, "CYP2C19", "*99/*99")).not.toThrow();

    const result = resolveGene(data, "CYP2C19", "*99/*99");

    expect(result).not.toBeNull();
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.reason).toBe("unknown_diplotype");
    }
  });
});

describe("'No Recommendation' rows", () => {
  test("a row with classification 'No Recommendation' is excluded from matcher output", () => {
    // Real row in the data: codeine, CYP2D6 activity_score "n/a" ->
    // classification "No Recommendation". Confirm the row actually exists
    // first, so a null result below proves the classification filter
    // fired rather than just "nothing matched at all".
    const codeineRows = data.recommendationsByDrug.get("codeine") ?? [];
    const noRecRow = codeineRows.find(
      row => row.lookupKey.CYP2D6 === "n/a" && row.classification === "No Recommendation",
    );
    expect(noRecRow).toBeDefined();

    const indeterminate: GeneResultsByGene = {
      CYP2D6: {
        matched: true,
        gene: "CYP2D6",
        diplotype: "synthetic",
        phenotype: "Indeterminate",
        activityScore: "n/a",
      },
    };

    expect(getRecommendation(data, "codeine", indeterminate)).toBeNull();
  });
});

describe("bonus coverage: multi-gene lookupkey requires every key to match", () => {
  test("TPMT alone (without NUDT15) does not match the azathioprine rule", () => {
    const tpmtOnly: GeneResultsByGene = {
      TPMT: {
        matched: true,
        gene: "TPMT",
        diplotype: "*3A/*3A",
        phenotype: "Poor Metabolizer",
        activityScore: "n/a",
      },
    };

    expect(getRecommendation(data, "azathioprine", tpmtOnly)).toBeNull();
  });
});

describe("ANE-33: getMedicationPgxFlag (medication-driven, drives the Patient Detail panel)", () => {
  // Patient C's diplotypes, dev notes §4.
  const patientCDiplotypes: Record<string, string> = {
    CYP2C19: "*1/*1",
    CYP2D6: "*4/*4",
    SLCO1B1: "*1/*1",
    TPMT: "*3A/*3A",
    NUDT15: "*1/*1",
    DPYD: "Reference/Reference",
  };

  test("free-text 'Azathioprine 50mg' flags Strong / alternative nonthiopurine (dev notes §6 example 1)", () => {
    const flag = getMedicationPgxFlag(data, patientCDiplotypes, "Azathioprine 50mg");

    expect(flag).not.toBeNull();
    expect(flag!.drug).toBe("azathioprine");
    expect(flag!.classification).toBe("Strong");
    expect(flag!.recommendationText.toLowerCase()).toContain(
      "alternative nonthiopurine immunosuppressant",
    );
  });

  test("free-text 'Codeine 30mg' flags Strong / avoid codeine, via CYP2D6 activity score (dev notes §6 example 2)", () => {
    const flag = getMedicationPgxFlag(data, patientCDiplotypes, "Codeine 30mg");

    expect(flag).not.toBeNull();
    expect(flag!.drug).toBe("codeine");
    expect(flag!.classification).toBe("Strong");
    expect(flag!.recommendationText.toLowerCase()).toContain("avoid codeine");
  });

  test("a medication that isn't one of the 5 CPIC demo drugs produces no flag", () => {
    expect(getMedicationPgxFlag(data, patientCDiplotypes, "Metformin 500mg")).toBeNull();
  });

  test("a CPIC demo drug the patient has no diplotype coverage for produces no flag, not a crash", () => {
    expect(getMedicationPgxFlag(data, {}, "Codeine 30mg")).toBeNull();
  });

  test("getPatientPgxDiplotypes round-trips the pgx-diplotypes extension shape from ANE-31", () => {
    const patient = {
      resourceType: "Patient" as const,
      extension: [
        {
          url: "http://yourapp.org/fhir/StructureDefinition/pgx-diplotypes",
          valueString: JSON.stringify(patientCDiplotypes),
        },
      ],
    };

    expect(getPatientPgxDiplotypes(patient)).toEqual(patientCDiplotypes);
  });

  test("getPatientPgxDiplotypes returns null when the extension is absent (most patients)", () => {
    expect(getPatientPgxDiplotypes({ resourceType: "Patient" as const })).toBeNull();
  });
});
