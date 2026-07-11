import { useCallback, useEffect, useState } from "react";

type FhirHumanName = {
  use?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
};

type FhirIdentifier = {
  type?: { text?: string };
  system?: string;
  value?: string;
};

type FhirPatient = {
  resourceType: "Patient";
  id: string;
  name?: FhirHumanName[];
  gender?: string;
  birthDate?: string;
  identifier?: FhirIdentifier[];
};

type FhirBundle = {
  resourceType: "Bundle";
  entry?: { resource: FhirPatient }[];
  link?: { relation: string; url: string }[];
};

function formatName(names?: FhirHumanName[]): string {
  const official = names?.find(n => n.use === "official") ?? names?.[0];
  if (!official) return "Unknown";

  const parts = [
    official.prefix?.join(" "),
    official.given?.join(" "),
    official.family,
  ].filter(Boolean);

  return parts.join(" ") || "Unknown";
}

function formatGender(gender?: string): string {
  if (!gender) return "—";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

function formatBirthDate(birthDate?: string): string {
  if (!birthDate) return "—";
  const date = new Date(birthDate + "T00:00:00");
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getMrn(patient: FhirPatient): string {
  const mrn = patient.identifier?.find(
    id => id.type?.text === "Medical Record Number" || id.system?.includes("smarthealthit"),
  );
  return mrn?.value ?? patient.id;
}

export function PatientList() {
  const [patients, setPatients] = useState<FhirPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchPatients = useCallback(async (pageOffset = 0, append = false) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/fhir/Patient?_count=20&_offset=${pageOffset}`);
      if (!res.ok) {
        throw new Error(`Failed to load patients (${res.status})`);
      }

      const bundle: FhirBundle = await res.json();
      const entries = bundle.entry?.map(e => e.resource) ?? [];

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

  return (
    <div className="patient-list">
      <div className="patient-list-header">
        <h2>Patients</h2>
        <button
          type="button"
          className="refresh-button"
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
                <th>MRN</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(patient => (
                <tr key={patient.id}>
                  <td>{formatName(patient.name)}</td>
                  <td>{formatBirthDate(patient.birthDate)}</td>
                  <td>{formatGender(patient.gender)}</td>
                  <td className="patient-mrn">{getMrn(patient)}</td>
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
    </div>
  );
}
