// Report-first cleanup tool for the orphaned Practitioner resources found
// during investigation (two "Meredith Grey" duplicates, two bare
// "meredith", "Jordan Doe", one duplicate "Owen Hunt", "Test Practitioner
// (build verification)") — leftovers from repeated local-DB resets before
// the local-username identifier fix (fhirServer.ts's
// findOrCreatePractitionerResource) existed to prevent them.
//
// A Practitioner counts as "linked to an active user" — and is therefore
// excluded from this report — if EITHER:
//   (a) it carries a LOCAL_USERNAME_IDENTIFIER_SYSTEM identifier whose
//       value matches an active practitioner user's username (the current,
//       forward-looking mechanism), OR
//   (b) its id matches the fhir_practitioner_id already on an active
//       practitioner user's row (the legacy mechanism every practitioner
//       predates the identifier fix under, until
//       backfill-practitioner-identifiers.ts has been run for it).
// Checking both means this script gives correct results whether or not
// the backfill has run yet — an active user's own Practitioner is never
// misreported as orphaned just because it isn't tagged yet.
//
// Every Practitioner NOT excluded by (a)/(b) is reported — including,
// necessarily, any pre-existing Practitioner resources on this Medblocks
// tenant that predate this app and were never touched by it (this app has
// no way to distinguish "our orphan" from "someone else's unrelated data"
// other than the identifier). To help a human tell those apart, each
// report row notes whether the resource's name shape is consistent with
// having been created by createPractitionerResource (fhirServer.ts) —
// that function never sets a `prefix` (e.g. "Dr."), so a resource with
// title/prefix on every name entry was almost certainly NOT created by
// this app, even though it still lacks our identifier.
//
// DOES NOT DELETE ANYTHING by default. Pass --delete to actually delete
// only the reported entries with zero referencing patients — entries with
// any patient reference are always skipped, --delete or not, because they
// need manual reassignment first (via the admin "Unassigned" flow) and
// this script does not touch Patient resources.
//
// Usage:
//   bun scripts/cleanup-orphaned-practitioners.ts            # report only
//   bun scripts/cleanup-orphaned-practitioners.ts --delete    # report, then delete the zero-reference ones
import type { HumanName, Patient, Practitioner } from "fhir/r4";
import { listUsers, pool } from "../src/db";
import {
  LOCAL_USERNAME_IDENTIFIER_SYSTEM,
  fhirFetch,
  searchAllResources,
} from "../src/fhirServer";
import { extractFhirError } from "../src/fhirError";
import { formatName } from "../src/fhirPatient";

type OrphanCandidate = {
  practitioner: Practitioner;
  identifierUsernames: string[];
  likelyAppCreated: boolean;
  referencingPatientIds: string[];
};

function localUsernameIdentifiers(practitioner: Practitioner): string[] {
  return (practitioner.identifier ?? [])
    .filter(id => id.system === LOCAL_USERNAME_IDENTIFIER_SYSTEM && id.value)
    .map(id => id.value!);
}

// createPractitionerResource (fhirServer.ts) never sets `prefix` on any
// name entry — so a Practitioner where every name entry lacks one is
// structurally consistent with having come from this app; one with a
// prefix ("Dr.", etc.) on any name entry structurally could not have.
function looksAppCreated(practitioner: Practitioner): boolean {
  const names: HumanName[] = practitioner.name ?? [];
  return names.every(n => !n.prefix || n.prefix.length === 0);
}

async function findOrphanCandidates(): Promise<{
  totalPractitioners: number;
  excludedCount: number;
  orphans: OrphanCandidate[];
}> {
  const activeUsers = (await listUsers()).filter(
    u => u.role === "practitioner" && u.is_active === 1,
  );
  const activeUsernames = new Set(activeUsers.map(u => u.username));
  const activeFhirIds = new Set(
    activeUsers.flatMap(u => (u.fhir_practitioner_id ? [u.fhir_practitioner_id] : [])),
  );

  const allPractitioners = await searchAllResources<Practitioner>(
    "/Practitioner?_count=100",
  );

  const orphans: OrphanCandidate[] = [];
  let excludedCount = 0;

  for (const practitioner of allPractitioners) {
    const identifierUsernames = localUsernameIdentifiers(practitioner);
    const linkedByIdentifier = identifierUsernames.some(u => activeUsernames.has(u));
    const linkedByLegacyId = Boolean(practitioner.id && activeFhirIds.has(practitioner.id));

    if (linkedByIdentifier || linkedByLegacyId) {
      excludedCount += 1;
      continue;
    }

    orphans.push({
      practitioner,
      identifierUsernames,
      likelyAppCreated: looksAppCreated(practitioner),
      referencingPatientIds: [], // filled in below
    });
  }

  // Separate pass so the summary counts above are settled before the
  // (network-heavier) per-candidate Patient search runs.
  for (const orphan of orphans) {
    const id = orphan.practitioner.id;
    if (!id) continue;
    const params = new URLSearchParams({
      "general-practitioner": `Practitioner/${id}`,
      _count: "100",
    });
    const patients = await searchAllResources<Patient>(`/Patient?${params}`);
    orphan.referencingPatientIds = patients.flatMap(p => (p.id ? [p.id] : []));
  }

  return { totalPractitioners: allPractitioners.length, excludedCount, orphans };
}

function printReport(totalPractitioners: number, excludedCount: number, orphans: OrphanCandidate[]) {
  console.log(
    `Scanned ${totalPractitioners} Practitioner resource(s) on the server. ` +
      `${excludedCount} linked to an active user (excluded). ` +
      `${orphans.length} candidate(s) below.\n`,
  );

  orphans.forEach((orphan, i) => {
    const { practitioner, identifierUsernames, likelyAppCreated, referencingPatientIds } = orphan;
    const safe = referencingPatientIds.length === 0;

    console.log(`[${i + 1}] Practitioner/${practitioner.id}`);
    console.log(`    name: ${formatName(practitioner.name)}`);
    console.log(
      `    local-username identifier: ${
        identifierUsernames.length > 0 ? identifierUsernames.join(", ") : "(none)"
      }`,
    );
    console.log(
      `    shape: ${
        likelyAppCreated
          ? "no title/prefix — consistent with being created by this app"
          : "has a title/prefix — likely pre-existing data this app did not create"
      }`,
    );
    console.log(
      `    referenced by ${referencingPatientIds.length} patient(s)` +
        (referencingPatientIds.length > 0 ? `: ${referencingPatientIds.join(", ")}` : ""),
    );
    console.log(
      safe
        ? `    verdict: SAFE TO DELETE (no patients reference it)`
        : `    verdict: NEEDS MANUAL REASSIGNMENT first — reassign the patient(s) above via the admin "Unassigned" flow, then re-run this script`,
    );
    console.log("");
  });

  const safeCount = orphans.filter(o => o.referencingPatientIds.length === 0).length;
  console.log(
    `Summary: ${safeCount} safe to delete, ${orphans.length - safeCount} need manual reassignment first.`,
  );
}

async function deletePractitioner(id: string): Promise<void> {
  const res = await fhirFetch(`/Practitioner/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => null);
    throw new Error(extractFhirError(body) ?? `Delete of Practitioner/${id} failed (${res.status})`);
  }
}

async function runDeletes(orphans: OrphanCandidate[]): Promise<void> {
  console.log("\n--delete passed — deleting zero-reference candidates only.\n");

  let deleted = 0;
  let failed = 0;

  for (const orphan of orphans) {
    const id = orphan.practitioner.id;
    if (!id) continue;

    if (orphan.referencingPatientIds.length > 0) {
      console.log(
        `SKIP    Practitioner/${id} (${formatName(orphan.practitioner.name)}): ` +
          `still referenced by ${orphan.referencingPatientIds.length} patient(s) — not deleted`,
      );
      continue;
    }

    try {
      await deletePractitioner(id);
      deleted += 1;
      console.log(`DELETED Practitioner/${id} (${formatName(orphan.practitioner.name)})`);
    } catch (err) {
      failed += 1;
      console.error(
        `FAIL    Practitioner/${id} (${formatName(orphan.practitioner.name)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  console.log(`\nDone. ${deleted} deleted, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

async function main() {
  const shouldDelete = process.argv.includes("--delete");

  const { totalPractitioners, excludedCount, orphans } = await findOrphanCandidates();
  printReport(totalPractitioners, excludedCount, orphans);

  if (orphans.length === 0) return;

  if (shouldDelete) {
    await runDeletes(orphans);
  } else {
    console.log(
      "\nReport only — nothing was deleted. Re-run with --delete once you've confirmed " +
        "which of the above are safe (it will still only delete zero-reference entries).",
    );
  }
}

try {
  await main();
} finally {
  await pool.end();
}
