import { useCallback, useEffect, useState } from "react";
import { formatBirthDate, formatGender, formatName, type Bundle, type Patient } from "./fhirPatient";
import {
  deletePatientCascade,
  fetchCascadeDeletePreview,
  fetchPractitioners,
  reassignPatientPractitioner,
  resetDemoData,
  type CascadeDeleteResult,
  type CascadeResourceType,
  type DemoPatientResetOutcome,
  type PractitionerSummary,
  type ResetDemoDataResult,
} from "./adminClient";

// Distinct from any real fhirPractitionerId (those are FHIR server ids,
// never an empty string) — safe as the dropdown's explicit "Unassigned"
// sentinel value.
const UNASSIGNED_VALUE = "";

function getGeneralPractitionerId(patient: Patient): string | undefined {
  const ref = patient.generalPractitioner?.[0]?.reference;
  return ref?.startsWith("Practitioner/") ? ref.split("/").pop() : undefined;
}

// Domain labels matching the app's own section names (VitalsSection,
// ConditionsSection, MedicationsSection) rather than raw FHIR resource
// type names, since this copy is admin-facing, not developer-facing.
function describeCounts(counts: Record<CascadeResourceType, number>): string {
  return `${counts.Observation} vital(s), ${counts.Condition} condition(s), ${counts.MedicationRequest} medication(s)`;
}

function summarizeDelete(
  result: CascadeDeleteResult,
  displayName: string,
): { kind: "success" | "failure"; text: string } {
  const counts = describeCounts(result.deletedCounts);

  if (result.patientDeleted) {
    return { kind: "success", text: `Deleted patient "${displayName}", along with ${counts}.` };
  }

  const failure = result.failure;
  const where = failure
    ? `${failure.resourceType}${failure.id ? ` ${failure.id}` : ""} during ${failure.stage} — ${failure.message}`
    : "an unexpected step";

  return {
    kind: "failure",
    text:
      `Delete for "${displayName}" stopped at ${where}. Deleted before stopping: ${counts}. ` +
      `The patient was NOT deleted — already-deleted resources are skipped on retry, so it's safe to try again.`,
  };
}

function summarizeResetOutcome(o: DemoPatientResetOutcome): string {
  if (o.succeeded) {
    return (
      `${o.label}: recreated as Patient/${o.newPatientId} — removed ${o.deletedExistingCount} ` +
      `existing match(es); ${o.medicationsCreated}/${o.medicationsExpected} medication(s) created.`
    );
  }
  return `${o.label}: FAILED — ${o.error}`;
}

function ResetDemoDataModal({
  resetting,
  onCancel,
  onConfirm,
}: {
  resetting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="patient-form-overlay" onClick={onCancel}>
      <div
        className="patient-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-demo-data-title"
      >
        <div className="patient-form-header">
          <h2 id="reset-demo-data-title">Reset demo data</h2>
          <button
            type="button"
            className="patient-form-close"
            onClick={onCancel}
            disabled={resetting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="patient-form">
          <p className="patient-form-error">
            This will delete and recreate all 3 demo patients (A, B, C) — any changes made to
            them since the last reset will be lost. Continue?
          </p>

          <div className="patient-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={resetting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="warning-button"
              onClick={onConfirm}
              disabled={resetting}
            >
              {resetting ? "Resetting…" : "Reset demo data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeletePatientModal({
  patient,
  previewCounts,
  previewLoading,
  previewError,
  deleting,
  onCancel,
  onConfirm,
}: {
  patient: Patient;
  previewCounts: Record<CascadeResourceType, number> | null;
  previewLoading: boolean;
  previewError: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const displayName = formatName(patient.name);

  return (
    <div className="patient-form-overlay" onClick={onCancel}>
      <div
        className="patient-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-patient-title"
      >
        <div className="patient-form-header">
          <h2 id="delete-patient-title">Delete patient</h2>
          <button
            type="button"
            className="patient-form-close"
            onClick={onCancel}
            disabled={deleting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="patient-form">
          <p className="patient-form-error">
            This permanently deletes <strong>{displayName}</strong> and every vital, condition,
            and medication record for them. This cannot be undone.
          </p>

          {previewError ? (
            <p className="patient-form-error">Couldn't check related records: {previewError}</p>
          ) : previewLoading ? (
            <p className="patient-list-status">Checking related records…</p>
          ) : previewCounts ? (
            <p className="patient-list-status">
              This will also delete {previewCounts.Observation} vital(s),{" "}
              {previewCounts.Condition} condition(s), and {previewCounts.MedicationRequest}{" "}
              medication(s).
            </p>
          ) : null}

          <div className="patient-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={onConfirm}
              disabled={deleting || previewLoading || Boolean(previewError)}
            >
              {deleting ? "Deleting…" : "Permanently delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminPatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [previewCounts, setPreviewCounts] = useState<Record<CascadeResourceType, number> | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSummary, setDeleteSummary] = useState<{
    kind: "success" | "failure";
    text: string;
  } | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetDemoDataResult | null>(null);

  const fetchPatients = useCallback(async (pageOffset = 0, append = false) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        _count: "20",
        _offset: String(pageOffset),
      });
      const res = await fetch(`/fhir/Patient?${params}`);
      if (!res.ok) throw new Error(`Failed to load patients (${res.status})`);

      const bundle: Bundle<Patient> = await res.json();
      const entries = bundle.entry?.flatMap(e => (e.resource ? [e.resource] : [])) ?? [];

      setPatients(prev => (append ? [...prev, ...entries] : entries));
      setOffset(pageOffset + entries.length);
      setHasMore(bundle.link?.some(l => l.relation === "next") ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patients");
      if (!append) setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
    fetchPractitioners()
      .then(setPractitioners)
      .catch(err => setError(err instanceof Error ? err.message : "Failed to load practitioners"));
  }, [fetchPatients]);

  // `selectedValue` is either a real fhirPractitionerId or UNASSIGNED_VALUE
  // ("") — the latter maps to `null`, which tells the API to clear
  // generalPractitioner entirely rather than assign it to anyone.
  const handleReassign = async (patient: Patient, selectedValue: string) => {
    if (!patient.id) return;
    const practitionerId = selectedValue === UNASSIGNED_VALUE ? null : selectedValue;

    setReassigningId(patient.id);
    setError(null);

    try {
      await reassignPatientPractitioner(patient.id, practitionerId);
      setPatients(prev =>
        prev.map(p =>
          p.id === patient.id
            ? {
                ...p,
                generalPractitioner: practitionerId
                  ? [{ reference: `Practitioner/${practitionerId}` }]
                  : undefined,
              }
            : p,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign patient");
    } finally {
      setReassigningId(null);
    }
  };

  const openDeleteModal = (patient: Patient) => {
    setDeleteTarget(patient);
    setDeleteSummary(null);
    setPreviewCounts(null);
    setPreviewError(null);

    if (!patient.id) return;
    setPreviewLoading(true);
    fetchCascadeDeletePreview(patient.id)
      .then(setPreviewCounts)
      .catch(err => setPreviewError(err instanceof Error ? err.message : "Failed to load preview"))
      .finally(() => setPreviewLoading(false));
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    const displayName = formatName(deleteTarget.name);

    setDeleting(true);
    try {
      const result = await deletePatientCascade(deleteTarget.id);
      setDeleteSummary(summarizeDelete(result, displayName));
      if (result.patientDeleted) {
        setPatients(prev => prev.filter(p => p.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete request failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetDemoData = async () => {
    setResetting(true);
    setResetError(null);
    setResetResult(null);

    try {
      const result = await resetDemoData();
      setResetResult(result);
      // The 3 demo patients get new ids on every reset — refresh so the
      // table reflects the recreated ones instead of the deleted ones.
      await fetchPatients();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset request failed");
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
    }
  };

  return (
    <div>
      <div className="detail-section-header">
        <h2>Patients</h2>
        <button
          type="button"
          className="secondary-button"
          onClick={() => fetchPatients()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="demo-reset-panel">
        <div>
          <h3>Demo data</h3>
          <p>
            Resets Demo Patients A, B, and C (docs/pgx_demo_dev_notes.md §4) to a known-clean
            state — deletes and recreates all three with their PGx profiles and medications
            restored. Affects only those 3 patients, not the ones listed below.
          </p>
        </div>
        <button
          type="button"
          className="warning-button"
          onClick={() => setShowResetConfirm(true)}
          disabled={resetting}
        >
          {resetting ? "Resetting…" : "Reset Demo Data"}
        </button>
      </div>

      {error && <p className="patient-list-error">{error}</p>}

      {resetError && <p className="patient-list-error">{resetError}</p>}

      {resetResult && (
        <div
          className={`reset-summary ${
            resetResult.allSucceeded ? "reset-summary-success" : "reset-summary-failure"
          }`}
        >
          <p>
            {resetResult.allSucceeded
              ? "Demo data reset complete."
              : "Demo data reset finished with errors — see below."}
          </p>
          <ul>
            {resetResult.outcomes.map(o => (
              <li key={o.key}>{summarizeResetOutcome(o)}</li>
            ))}
          </ul>
        </div>
      )}

      {deleteSummary && (
        <p className={deleteSummary.kind === "success" ? "patient-list-status" : "patient-list-error"}>
          {deleteSummary.text}
        </p>
      )}

      {loading && patients.length === 0 ? (
        <p className="patient-list-status">Loading patients…</p>
      ) : patients.length === 0 ? (
        <p className="patient-list-status">No patients found.</p>
      ) : (
        <div className="patient-table-wrapper">
          <table className="patient-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date of birth</th>
                <th>Gender</th>
                <th>Practitioner</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map(patient => {
                const rawPractitionerId = getGeneralPractitionerId(patient);
                // A patient's generalPractitioner reference is only
                // treated as a real assignment if it matches a currently
                // active practitioner user — anything else (no reference,
                // or a reference to an orphaned/deleted Practitioner with
                // no active user behind it) displays and behaves as
                // Unassigned, on load, with no click required.
                const isActiveAssignment = Boolean(
                  rawPractitionerId &&
                    practitioners.some(p => p.fhirPractitionerId === rawPractitionerId),
                );
                const isOrphanedReference = Boolean(rawPractitionerId) && !isActiveAssignment;
                const dropdownValue = isActiveAssignment ? rawPractitionerId! : UNASSIGNED_VALUE;

                return (
                  <tr key={patient.id}>
                    <td>{formatName(patient.name)}</td>
                    <td>{formatBirthDate(patient.birthDate)}</td>
                    <td>{formatGender(patient.gender)}</td>
                    <td>
                      <div className="practitioner-assignment-cell">
                        <select
                          value={dropdownValue}
                          onChange={e => handleReassign(patient, e.target.value)}
                          disabled={reassigningId === patient.id}
                        >
                          <option value={UNASSIGNED_VALUE}>Unassigned</option>
                          {practitioners.map(p => (
                            <option key={p.fhirPractitionerId} value={p.fhirPractitionerId}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                        {isOrphanedReference && (
                          <span
                            className="status-badge status-unknown"
                            title={`This patient's practitioner reference (Practitioner/${rawPractitionerId}) has no matching active user — shown as Unassigned. Pick a practitioner above to reassign.`}
                          >
                            orphaned reference
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="patient-actions">
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => openDeleteModal(patient)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className="load-more-button"
          onClick={() => fetchPatients(offset, true)}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}

      {deleteTarget && (
        <DeletePatientModal
          patient={deleteTarget}
          previewCounts={previewCounts}
          previewLoading={previewLoading}
          previewError={previewError}
          deleting={deleting}
          onCancel={closeDeleteModal}
          onConfirm={handleConfirmDelete}
        />
      )}

      {showResetConfirm && (
        <ResetDemoDataModal
          resetting={resetting}
          onCancel={() => {
            if (!resetting) setShowResetConfirm(false);
          }}
          onConfirm={handleResetDemoData}
        />
      )}
    </div>
  );
}
