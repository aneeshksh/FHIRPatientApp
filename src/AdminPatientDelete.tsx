import { useCallback, useEffect, useState } from "react";
import { formatName, type Bundle, type Patient } from "./fhirPatient";
import { deletePatientCascade, type CascadeDeleteResult } from "./adminClient";

// Admin-only, destructive cascade-delete tool for clearing out demo/test
// patients before external sharing. Deliberately NOT linked from the main
// nav or AdminPanel's tabs — reachable only by navigating to /admin/patients
// directly (see App.tsx). The underlying DELETE endpoint
// (/api/admin/patients/:id in adminRoutes.ts) is gated by the existing
// requireRole("admin") session check, same as every other /api/admin/*
// route — nothing new was built here. Known gap: no audit log of who
// deleted what and when, and this page itself has no additional
// access-control beyond that shared session check (it's unlisted, not
// locked down) — add real page-level authorization before this is exposed
// any more broadly than "an admin who knows the URL."

type DeleteTarget = { patient: Patient; displayName: string };

type Summary = { kind: "success" | "failure"; text: string };

function formatLastUpdated(patient: Patient): string {
  // FHIR's base Patient resource has no dedicated "created" field —
  // meta.lastUpdated is the closest standard proxy, and is exact for a
  // demo/seed patient that's never been edited since creation.
  const lastUpdated = patient.meta?.lastUpdated;
  if (!lastUpdated) return "—";
  return new Date(lastUpdated).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function describeCounts(counts: CascadeDeleteResult["deletedCounts"]): string {
  return `${counts.Observation} observation(s), ${counts.Condition} condition(s), ${counts.MedicationRequest} medication request(s)`;
}

function summarize(result: CascadeDeleteResult, displayName: string): Summary {
  const counts = describeCounts(result.deletedCounts);

  if (result.patientDeleted) {
    return {
      kind: "success",
      text: `Deleted patient "${displayName}" (${result.patientId}), along with ${counts}.`,
    };
  }

  const failure = result.failure;
  const where = failure
    ? `${failure.resourceType}${failure.id ? ` ${failure.id}` : ""} during ${failure.stage} — ${failure.message}`
    : "an unexpected step";

  return {
    kind: "failure",
    text:
      `Cascade delete for "${displayName}" (${result.patientId}) stopped at ${where}. ` +
      `Deleted before stopping: ${counts}. The Patient resource was NOT deleted — ` +
      `already-deleted resources are skipped on retry, so it's safe to try again.`,
  };
}

function DeleteConfirmModal({
  displayName,
  deleting,
  onCancel,
  onConfirm,
}: {
  displayName: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().length > 0 && typed.trim() === displayName;

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
            This permanently deletes <strong>{displayName}</strong> and every Observation,
            Condition, and MedicationRequest referencing them. This cannot be undone.
          </p>

          <label>
            Type the patient's full name to confirm ({displayName})
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={displayName}
              disabled={deleting}
              autoFocus
            />
          </label>

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
              disabled={!matches || deleting}
            >
              {deleting ? "Deleting…" : "Permanently delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminPatientDelete() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const fetchPatients = useCallback(async (pageOffset = 0, append = false) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ _count: "20", _offset: String(pageOffset) });
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
  }, [fetchPatients]);

  const closeModal = () => {
    if (deleting) return;
    setTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!target?.patient.id) return;
    setDeleting(true);
    setError(null);

    try {
      const result = await deletePatientCascade(target.patient.id);
      setSummary(summarize(result, target.displayName));
      if (result.patientDeleted) {
        setPatients(prev => prev.filter(p => p.id !== target.patient.id));
      }
      setTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete request failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="patient-list">
      <div className="patient-list-header">
        <h1>Delete patients</h1>
        <button
          type="button"
          className="secondary-button"
          onClick={() => fetchPatients()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <p className="pgx-disclaimer">
        <span aria-hidden="true">⚠</span> Destructive, irreversible admin tool. Deleting a patient
        also deletes every Observation, Condition, and MedicationRequest that references them.
        One patient at a time, by design.
      </p>

      {summary && (
        <p className={summary.kind === "success" ? "patient-list-status" : "patient-list-error"}>
          {summary.text}
        </p>
      )}

      {error && <p className="patient-list-error">{error}</p>}

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
                <th>Patient ID</th>
                <th>Last updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map(patient => (
                <tr key={patient.id}>
                  <td>{formatName(patient.name)}</td>
                  <td>{patient.id}</td>
                  <td>{formatLastUpdated(patient)}</td>
                  <td className="patient-actions">
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() =>
                        setTarget({ patient, displayName: formatName(patient.name) })
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
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

      {target && (
        <DeleteConfirmModal
          displayName={target.displayName}
          deleting={deleting}
          onCancel={closeModal}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
