import { useCallback, useEffect, useState } from "react";
import { formatBirthDate, formatGender, formatName, type Bundle, type Patient } from "./fhirPatient";
import {
  fetchPractitioners,
  reassignPatientPractitioner,
  type PractitionerSummary,
} from "./adminClient";

function getGeneralPractitionerId(patient: Patient): string | undefined {
  const ref = patient.generalPractitioner?.[0]?.reference;
  return ref?.startsWith("Practitioner/") ? ref.split("/").pop() : undefined;
}

export function AdminPatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

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

  const handleReassign = async (patient: Patient, practitionerId: string) => {
    if (!patient.id || !practitionerId) return;
    setReassigningId(patient.id);
    setError(null);

    try {
      await reassignPatientPractitioner(patient.id, practitionerId);
      setPatients(prev =>
        prev.map(p =>
          p.id === patient.id
            ? { ...p, generalPractitioner: [{ reference: `Practitioner/${practitionerId}` }] }
            : p,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign patient");
    } finally {
      setReassigningId(null);
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
                <th>Date of birth</th>
                <th>Gender</th>
                <th>Practitioner</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(patient => {
                const currentPractitionerId = getGeneralPractitionerId(patient);
                return (
                  <tr key={patient.id}>
                    <td>{formatName(patient.name)}</td>
                    <td>{formatBirthDate(patient.birthDate)}</td>
                    <td>{formatGender(patient.gender)}</td>
                    <td>
                      <select
                        value={currentPractitionerId ?? ""}
                        onChange={e => handleReassign(patient, e.target.value)}
                        disabled={reassigningId === patient.id}
                      >
                        <option value="" disabled>
                          Unassigned
                        </option>
                        {practitioners.map(p => (
                          <option key={p.fhirPractitionerId} value={p.fhirPractitionerId}>
                            {p.fullName}
                          </option>
                        ))}
                      </select>
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
    </div>
  );
}
