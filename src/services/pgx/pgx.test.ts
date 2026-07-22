import { beforeAll, describe, expect, test } from "bun:test";
import { loadPgxData } from "./data";
import { resolveGene } from "./resolveGene";
import { getRecommendation } from "./getRecommendation";
import { getMedicationPgxFlag } from "./getMedicationPgxFlag";
import { getPatientPgxDiplotypes, setPatientPgxDiplotypes } from "./patientDiplotypes";
import { getGeneOptions } from "./geneOptions";
import { isPlainStringRecord, validateDiplotypesAgainstOptions } from "./validateDiplotypes";
import { DEMO_PATIENT_B_PGX_PROFILE } from "./demoProfiles";
import { PGX_GENES } from "./types";
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

describe("ANE-35: setPatientPgxDiplotypes", () => {
  test("adds the extension to a patient that has none", () => {
    const patient = { resourceType: "Patient" as const, id: "p1" };
    const updated = setPatientPgxDiplotypes(patient, { CYP2C19: "*1/*17" });

    expect(getPatientPgxDiplotypes(updated)).toEqual({ CYP2C19: "*1/*17" });
  });

  test("overwrites an existing extension entirely rather than merging", () => {
    const patient = {
      resourceType: "Patient" as const,
      id: "p1",
      extension: [
        {
          url: "http://yourapp.org/fhir/StructureDefinition/pgx-diplotypes",
          valueString: JSON.stringify({ CYP2C19: "*1/*1", CYP2D6: "*1/*1" }),
        },
      ],
    };

    const updated = setPatientPgxDiplotypes(patient, { TPMT: "*3A/*3A" });

    expect(getPatientPgxDiplotypes(updated)).toEqual({ TPMT: "*3A/*3A" });
  });

  test("preserves other extensions on the patient untouched", () => {
    const otherExt = { url: "http://example.org/other", valueString: "keep-me" };
    const patient = { resourceType: "Patient" as const, id: "p1", extension: [otherExt] };

    const updated = setPatientPgxDiplotypes(patient, { CYP2C19: "*1/*17" });

    expect(updated.extension).toContainEqual(otherExt);
  });
});

describe("ANE-35: getGeneOptions (dropdown source of truth)", () => {
  test("returns distinct diplotype values per gene, matching what resolveGene accepts", () => {
    const optionsByGene = getGeneOptions(data);

    expect(Object.keys(optionsByGene).sort()).toEqual([...PGX_GENES].sort());
    expect(optionsByGene.CYP2C19).toContain("*1/*17");
    expect(optionsByGene.CYP2D6).toContain("*1/*4");

    // Every option offered by the dropdown must actually resolve — this is
    // the structural guarantee the ANE-35 UI depends on.
    for (const gene of PGX_GENES) {
      for (const diplotype of optionsByGene[gene]!.slice(0, 5)) {
        expect(resolveGene(data, gene, diplotype).matched).toBe(true);
      }
    }
  });

  test("does not offer the reversed allele order as a separate option (dev notes §5 quirk)", () => {
    const optionsByGene = getGeneOptions(data);
    // The table's canonical order is "*1/*4", never "*4/*1" — confirm the
    // dropdown mirrors the table's canonical strings rather than adding both.
    expect(optionsByGene.CYP2D6).toContain("*1/*4");
    expect(optionsByGene.CYP2D6).not.toContain("*4/*1");
  });
});

describe("ANE-35: validateDiplotypesAgainstOptions (advanced JSON path)", () => {
  let optionsByGene: Record<string, string[]>;

  beforeAll(() => {
    optionsByGene = getGeneOptions(data);
  });

  test("passes when every gene/diplotype pair is a real dropdown option", () => {
    const errors = validateDiplotypesAgainstOptions(optionsByGene, {
      CYP2C19: "*1/*17",
      CYP2D6: "*1/*4",
    });
    expect(errors).toEqual([]);
  });

  test("flags an unknown gene name", () => {
    const errors = validateDiplotypesAgainstOptions(optionsByGene, { NOTAGENE: "*1/*1" });
    expect(errors).toEqual([{ gene: "NOTAGENE", diplotype: "*1/*1", reason: "unknown_gene" }]);
  });

  test("flags a diplotype not in the table for that gene", () => {
    const errors = validateDiplotypesAgainstOptions(optionsByGene, { CYP2C19: "*99/*99" });
    expect(errors).toEqual([{ gene: "CYP2C19", diplotype: "*99/*99", reason: "unknown_diplotype" }]);
  });

  test("flags a diplotype given in the wrong allele order relative to the table's canonical string", () => {
    // *4/*1 resolves via resolveGene's reversed-lookup fallback, but the
    // dropdown/advanced-path options are the table's exact canonical
    // strings only ("*1/*4") — the UI must not offer or accept the reversed
    // form, even though the matcher would tolerate it.
    const errors = validateDiplotypesAgainstOptions(optionsByGene, { CYP2D6: "*4/*1" });
    expect(errors).toEqual([{ gene: "CYP2D6", diplotype: "*4/*1", reason: "unknown_diplotype" }]);
  });

  test("isPlainStringRecord rejects arrays and non-string values", () => {
    expect(isPlainStringRecord({ CYP2C19: "*1/*17" })).toBe(true);
    expect(isPlainStringRecord([])).toBe(false);
    expect(isPlainStringRecord({ CYP2C19: 123 })).toBe(false);
    expect(isPlainStringRecord(null)).toBe(false);
  });
});

describe("ANE-36: DEMO_PATIENT_B_PGX_PROFILE (shared by seed script + Load Demo Data button)", () => {
  test("matches dev notes §4 Patient B exactly: all 6 genes, every value resolves", () => {
    expect(Object.keys(DEMO_PATIENT_B_PGX_PROFILE).sort()).toEqual([...PGX_GENES].sort());

    for (const [gene, diplotype] of Object.entries(DEMO_PATIENT_B_PGX_PROFILE)) {
      expect(resolveGene(data, gene, diplotype).matched).toBe(true);
    }
  });

  test("CYP2C19 *2/*2 resolves to Poor Metabolizer (the clopidogrel-flag diplotype)", () => {
    const result = resolveGene(data, "CYP2C19", DEMO_PATIENT_B_PGX_PROFILE.CYP2C19!);
    expect(result).toMatchObject({ matched: true, phenotype: "Poor Metabolizer" });
  });

  test("SLCO1B1 *5/*5 resolves to Poor Function (the simvastatin-flag diplotype)", () => {
    const result = resolveGene(data, "SLCO1B1", DEMO_PATIENT_B_PGX_PROFILE.SLCO1B1!);
    expect(result).toMatchObject({ matched: true, phenotype: "Poor Function" });
  });

  test("every value is also a real dropdown option (ANE-35 getGeneOptions), not just matcher-resolvable", () => {
    const optionsByGene = getGeneOptions(data);
    for (const [gene, diplotype] of Object.entries(DEMO_PATIENT_B_PGX_PROFILE)) {
      expect(optionsByGene[gene]).toContain(diplotype);
    }
  });
});
