import { useEffect, useState } from "react";
import type { Patient } from "fhir/r4";
// Direct file import, not the src/services/pgx barrel — the barrel also
// re-exports loadPgxData, which reads CSVs via Bun.file and has no business
// being pulled into the browser bundle. This file is pure JSON parsing, so
// it's safe to import directly into a browser-bundled component.
import { getPatientPgxDiplotypes } from "./services/pgx/patientDiplotypes";
import { fetchPgxInteractions, type MedicationPgxFlag } from "./pgxClient";
import { getMedicationDisplay, type Medication, type MedicationRequest } from "./fhirClinical";

type PgxInteractionsSectionProps = {
  patient: Patient;
  medicationRequests: MedicationRequest[];
  medicationsById: Map<string, Medication>;
};

const CLASSIFICATION_BADGE_CLASS: Record<string, string> = {
  Strong: "status-strong",
  Moderate: "status-moderate",
  Optional: "status-optional",
};

export function PgxInteractionsSection({
  patient,
  medicationRequests,
  medicationsById,
}: PgxInteractionsSectionProps) {
  const diplotypes = getPatientPgxDiplotypes(patient);

  const activeMedications = medicationRequests.filter(
    (mr): mr is MedicationRequest & { id: string } => mr.status === "active" && Boolean(mr.id),
  );
  // Stable key for the effect below — re-runs only when the actual set of
  // active medications changes, not on every parent re-render.
  const medicationsKey = activeMedications.map(mr => mr.id).join(",");

  const [flags, setFlags] = useState<MedicationPgxFlag[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diplotypes || activeMedications.length === 0) {
      setFlags([]);
      return;
    }

    let cancelled = false;
    const medications = activeMedications.map(mr => ({
      id: mr.id,
      text: getMedicationDisplay(mr, medicationsById),
    }));

    fetchPgxInteractions(diplotypes, medications)
      .then(result => {
        if (!cancelled) setFlags(result);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PGx interactions");
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on medicationsKey, not object identity
  }, [diplotypes, medicationsKey, medicationsById]);

  // Requirement: absent extension -> no panel at all, not even an empty
  // state. Most patients won't have it (only the ANE-31 demo patients do).
  if (!diplotypes) return null;

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>PGx Interactions</h2>
      </div>

      <p className="pgx-disclaimer">
        <span aria-hidden="true">ⓘ</span> Demo scope: CPIC guidance only (not DPWG or FDA
        labeling), covering 6 genes. Diplotypes shown are pre-assigned demo data, not derived
        from variant calling.
      </p>

      {error ? (
        <p className="patient-list-error">{error}</p>
      ) : flags.length === 0 ? (
        <p className="patient-list-status">No PGx interactions flagged for current medications.</p>
      ) : (
        <ul className="pgx-flag-list">
          {flags.map(flag => (
            <li key={flag.medicationId} className="pgx-flag-item">
              <div className="pgx-flag-header">
                <span className="pgx-flag-drug">{flag.drug}</span>
                <span
                  className={`status-badge ${CLASSIFICATION_BADGE_CLASS[flag.classification] ?? "status-unknown"}`}
                >
                  {flag.classification}
                </span>
              </div>
              <p className="pgx-flag-text">{flag.recommendationText}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
