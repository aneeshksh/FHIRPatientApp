// Demo Patient B — Cardiac Risk (docs/pgx_demo_dev_notes.md §4). Single
// source of truth for these diplotype values: ANE-31's seed script
// (scripts/seed-demo-patients.ts) and the ANE-36 "Load Demo Data" button
// (PgxProfileForm.tsx) both import this constant instead of each hardcoding
// their own copy, so the two can't silently drift apart.
//
// CYP2C19 *2/*2 (Poor Metabolizer) is what produces the clopidogrel flag
// under the NVI population handling (ANE-30); SLCO1B1 *5/*5 (Poor Function)
// is what produces the simvastatin flag — together these are Patient B's
// full "two visible flags" story, not just the clopidogrel half of it.
// Dependency-free (no Bun.file) so it's safe to import directly into a
// browser-bundled component, same as patientDiplotypes.ts.
export const DEMO_PATIENT_B_PGX_PROFILE: Record<string, string> = {
  CYP2C19: "*2/*2",
  CYP2D6: "*1/*1",
  SLCO1B1: "*5/*5",
  TPMT: "*1/*1",
  NUDT15: "*1/*1",
  DPYD: "Reference/Reference",
};
