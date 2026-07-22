import { useEffect, useState } from "react";
import type { Patient } from "fhir/r4";
// Direct file imports, not the src/services/pgx barrel — the barrel also
// re-exports loadPgxData, which reads CSVs via Bun.file and has no business
// being pulled into the browser bundle. These files are pure JSON parsing /
// fetch-based, so they're safe to import directly into a browser-bundled
// component.
import { getPatientPgxDiplotypes } from "./services/pgx/patientDiplotypes";
import { savePgxProfile } from "./services/pgx/savePgxProfile";
import { fetchPgxInteractions, type MedicationPgxFlag } from "./pgxClient";
import { getMedicationDisplay, type Medication, type MedicationRequest } from "./fhirClinical";
import { PgxProfileForm } from "./PgxProfileForm";

type PgxInteractionsSectionProps = {
  patient: Patient;
  medicationRequests: MedicationRequest[];
  medicationsById: Map<string, Medication>;
  onPatientUpdated: (patient: Patient) => void;
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
  onPatientUpdated,
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

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setFormError(null);
  };

  // On success, hand the updated Patient back up to PatientDetail so its
  // `patient` state (and therefore this component's `diplotypes`/effect
  // above) refreshes immediately — no separate page reload needed to see
  // newly-flagged medications.
  const handleSave = async (newDiplotypes: Record<string, string>) => {
    setSaving(true);
    setFormError(null);
    try {
      const updated = await savePgxProfile(patient, newDiplotypes);
      onPatientUpdated(updated);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save PGx profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>PGx Interactions</h2>
        <button type="button" className="primary-button" onClick={() => setShowForm(true)}>
          {diplotypes ? "Edit PGx profile" : "Add PGx profile"}
        </button>
      </div>

      {!diplotypes ? (
        <p className="patient-list-status">
          No PGx profile on file for this patient. Add one to enable interaction checks against
          current medications.
        </p>
      ) : (
        <>
          <p className="pgx-disclaimer">
            <span aria-hidden="true">ⓘ</span> Demo scope: CPIC guidance only (not DPWG or FDA
            labeling), covering 6 genes. Diplotypes shown are pre-assigned demo data, not derived
            from variant calling.
          </p>

          {error ? (
            <p className="patient-list-error">{error}</p>
          ) : flags.length === 0 ? (
            <p className="patient-list-status">
              No PGx interactions flagged for current medications.
            </p>
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
        </>
      )}

      {showForm && (
        <PgxProfileForm
          patient={patient}
          onSubmit={handleSave}
          onCancel={closeForm}
          saving={saving}
          error={formError}
        />
      )}
    </section>
  );
}
