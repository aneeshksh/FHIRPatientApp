// One-time data-seeding script for ANE-31 — not a feature, run manually:
//   bun scripts/seed-demo-patients.ts
//
// Creates the 3 demo patients from docs/pgx_demo_dev_notes.md §4, each
// carrying a pgx-diplotypes extension (shape given directly in the ANE-31
// ticket text: url http://yourapp.org/fhir/StructureDefinition/pgx-diplotypes,
// valueString = JSON of gene:diplotype pairs — already validated via Postman,
// used as-is here, not redesigned).
//
// Reuses the existing server-side FHIR write helper (`fhirFetch` in
// src/fhirServer.ts) rather than a new POST path — this is the same helper
// createPractitionerResource/setPatientGeneralPractitioner already use for
// server-initiated writes. The ticket named src/services/patients.ts as the
// existing patient-creation service to reuse, but no such file exists in
// this repo (nor does project-brief.md, which the ticket also cites) —
// `fhirFetch` plus the Patient shape below is the closest actual existing
// pattern, so that's what this reuses. Flagging the mismatch rather than
// fabricating either missing file.
//
// The patient specs (names, diplotypes) live in src/services/demoPatients.ts
// — shared with the admin panel's "Reset Demo Data" button, so this script
// and that button can never drift apart on what "Demo Patient A/B/C" means.
import type { Patient } from "fhir/r4";
import { fhirFetch } from "../src/fhirServer";
import { extractFhirError } from "../src/fhirError";
import { loadPgxData } from "../src/services/pgx/data";
import { resolveGene } from "../src/services/pgx/resolveGene";
import {
  PGX_DIPLOTYPES_EXTENSION_URL,
  setPatientPgxDiplotypes,
} from "../src/services/pgx/patientDiplotypes";
import { DEMO_PATIENT_SPECS, type DemoPatientSpec } from "../src/services/demoPatients";

function buildPatientResource(spec: DemoPatientSpec): Patient {
  const bare: Patient = {
    resourceType: "Patient",
    name: [{ use: "official", given: spec.given, family: spec.family }],
    gender: spec.gender,
    birthDate: spec.birthDate,
  };
  return setPatientPgxDiplotypes(bare, spec.pgxResults);
}

function sameDiplotypeSet(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
  return aKeys.every(k => a[k] === b[k]);
}

async function preflightValidate(spec: DemoPatientSpec): Promise<void> {
  const pgxData = await loadPgxData();
  const unresolved: string[] = [];

  for (const [gene, diplotype] of Object.entries(spec.pgxResults)) {
    const result = resolveGene(pgxData, gene, diplotype);
    if (!result.matched) {
      unresolved.push(`${gene} ${diplotype}`);
    }
  }

  if (unresolved.length > 0) {
    throw new Error(
      `${spec.label}: diplotype(s) not found in demo_diplotype_to_phenotype.csv: ${unresolved.join(", ")}`,
    );
  }
}

async function createAndVerify(spec: DemoPatientSpec): Promise<{ label: string; id: string }> {
  await preflightValidate(spec);

  const createRes = await fhirFetch("/Patient", {
    method: "POST",
    body: JSON.stringify(buildPatientResource(spec)),
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => null);
    throw new Error(
      `${spec.label}: create failed (${createRes.status}) — ${
        extractFhirError(errBody) ?? "unknown error"
      }`,
    );
  }

  const created: Patient = await createRes.json();
  if (!created.id) {
    throw new Error(`${spec.label}: server accepted create but returned no id`);
  }

  // GET it back and confirm the extension persisted, same check already
  // done once via Postman.
  const getRes = await fhirFetch(`/Patient/${created.id}`);
  if (!getRes.ok) {
    throw new Error(`${spec.label}: GET-back failed (${getRes.status}) for id ${created.id}`);
  }

  const fetched: Patient = await getRes.json();
  const pgxExtension = fetched.extension?.find(ext => ext.url === PGX_DIPLOTYPES_EXTENSION_URL);

  if (!pgxExtension?.valueString) {
    throw new Error(
      `${spec.label}: pgx-diplotypes extension missing on GET-back for id ${created.id}`,
    );
  }

  const persisted: Record<string, string> = JSON.parse(pgxExtension.valueString);
  if (!sameDiplotypeSet(persisted, spec.pgxResults)) {
    throw new Error(
      `${spec.label}: persisted extension diplotypes don't match what was sent for id ${created.id}\n` +
        `  sent:      ${JSON.stringify(spec.pgxResults)}\n` +
        `  persisted: ${JSON.stringify(persisted)}`,
    );
  }

  console.log(`✓ ${spec.label} — id ${created.id}`);
  console.log(`  extension verified on GET-back: ${pgxExtension.valueString}`);

  return { label: spec.label, id: created.id };
}

async function main() {
  const results: { label: string; id: string }[] = [];
  const failures: string[] = [];

  for (const spec of DEMO_PATIENT_SPECS) {
    try {
      results.push(await createAndVerify(spec));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${spec.label}: ${message}`);
      failures.push(spec.label);
    }
  }

  console.log("\n--- Summary ---");
  for (const r of results) {
    console.log(`${r.label}: ${r.id}`);
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} of ${DEMO_PATIENT_SPECS.length} patient(s) failed: ${failures.join(", ")}`,
    );
    process.exit(1);
  }
}

await main();
