// One-time backfill — tags the Practitioner resources that ARE correctly
// linked to a current active practitioner user row with the
// local-username identifier findOrCreatePractitionerResource
// (src/fhirServer.ts) now relies on going forward, using the existing
// fhir_practitioner_id mapping already in the `users` table as the source
// of truth for "which Practitioner belongs to which username."
//
// Deliberately does NOT touch, merge, or delete the orphaned Practitioner
// resources found in the investigation (two "Meredith Grey", two bare
// "meredith", "Jordan Doe", one duplicate "Owen Hunt", "Test Practitioner
// (build verification)") — none of those are the current
// fhir_practitioner_id for any active user, so this script never looks at
// them. Cleaning those up is a separate, later ticket that also touches
// patient reassignment.
//
// Idempotent — safe to re-run; a Practitioner already carrying the
// identifier is skipped, not re-tagged.
//
// Run manually: bun scripts/backfill-practitioner-identifiers.ts
import { listUsers, pool } from "../src/db";
import { fhirFetch, LOCAL_USERNAME_IDENTIFIER_SYSTEM } from "../src/fhirServer";
import { extractFhirError } from "../src/fhirError";
import type { Practitioner } from "fhir/r4";

function alreadyTagged(practitioner: Practitioner, username: string): boolean {
  return (
    practitioner.identifier?.some(
      id => id.system === LOCAL_USERNAME_IDENTIFIER_SYSTEM && id.value === username,
    ) ?? false
  );
}

async function backfillOne(username: string, practitionerId: string): Promise<string> {
  const getRes = await fhirFetch(`/Practitioner/${practitionerId}`);

  if (!getRes.ok) {
    if (getRes.status === 404) {
      return (
        `SKIP   ${username} -> Practitioner/${practitionerId}: not found on server ` +
        `(dangling fhir_practitioner_id — this backfill only tags existing resources, never repairs the mapping)`
      );
    }
    throw new Error(`GET Practitioner/${practitionerId} failed (${getRes.status})`);
  }

  const practitioner: Practitioner = await getRes.json();

  if (alreadyTagged(practitioner, username)) {
    return `SKIP   ${username} -> Practitioner/${practitionerId}: already tagged`;
  }

  const updated: Practitioner = {
    ...practitioner,
    identifier: [
      ...(practitioner.identifier ?? []),
      { system: LOCAL_USERNAME_IDENTIFIER_SYSTEM, value: username },
    ],
  };

  const putRes = await fhirFetch(`/Practitioner/${practitionerId}`, {
    method: "PUT",
    body: JSON.stringify(updated),
  });

  if (!putRes.ok) {
    const body = await putRes.json().catch(() => null);
    throw new Error(
      extractFhirError(body) ?? `PUT Practitioner/${practitionerId} failed (${putRes.status})`,
    );
  }

  return `TAGGED ${username} -> Practitioner/${practitionerId}`;
}

async function main() {
  const targets = (await listUsers()).filter(
    (u): u is typeof u & { fhir_practitioner_id: string } =>
      u.role === "practitioner" && u.is_active === 1 && Boolean(u.fhir_practitioner_id),
  );

  if (targets.length === 0) {
    console.log("No active practitioner users with a linked fhir_practitioner_id found.");
    return;
  }

  console.log(`Backfilling identifiers for ${targets.length} active practitioner user(s)...\n`);

  let failures = 0;
  for (const user of targets) {
    try {
      console.log(await backfillOne(user.username, user.fhir_practitioner_id));
    } catch (err) {
      failures += 1;
      console.error(
        `FAIL   ${user.username} -> Practitioner/${user.fhir_practitioner_id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  console.log(`\nDone. ${targets.length - failures} succeeded, ${failures} failed.`);
  if (failures > 0) process.exitCode = 1;
}

try {
  await main();
} finally {
  await pool.end();
}
