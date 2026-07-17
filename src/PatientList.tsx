import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PatientForm } from "./PatientForm";
import {
  formatBirthDate,
  formatGender,
  formatName,
  savePatient,
  type Bundle,
  type Patient,
} from "./fhirPatient";

type PatientListProps = {
  practitionerId: string;
  onSelectPatient: (id: string) => void;
};

export function PatientList({ practitionerId, onSelectPatient }: PatientListProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [editingPatient, setEditingPatient] = useState<Patient | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchPatients = useCallback(
    async (pageOffset = 0, append = false, name = activeSearch) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          _count: "20",
          _offset: String(pageOffset),
          "general-practitioner": `Practitioner/${practitionerId}`,
        });
        if (name.trim()) {
          params.set("name", name.trim());
        }

        const res = await fetch(`/fhir/Patient?${params}`);
        if (!res.ok) {
          throw new Error(`Failed to load patients (${res.status})`);
        }

        const bundle: Bundle<Patient> = await res.json();
        const entries = bundle.entry?.flatMap(e => e.resource ? [e.resource] : []) ?? [];

        setPatients(prev => (append ? [...prev, ...entries] : entries));
        setOffset(pageOffset + entries.length);
        setHasMore(bundle.link?.some(l => l.relation === "next") ?? false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load patients");
        if (!append) setPatients([]);
      } finally {
        setLoading(false);
      }
    },
    [activeSearch, practitionerId],
  );

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    setActiveSearch(query);
    fetchPatients(0, false, query);
  };

  const clearSearch = () => {
    setSearchInput("");
    setActiveSearch("");
    fetchPatients(0, false, "");
  };

  const openCreateForm = () => {
    setEditingPatient(undefined);
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (patient: Patient) => {
    setEditingPatient(patient);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingPatient(undefined);
    setFormError(null);
  };

  const handleSave = async (values: Parameters<typeof savePatient>[0]) => {
    setSaving(true);
    setFormError(null);

    try {
      await savePatient(values, editingPatient, practitionerId);
      setShowForm(false);
      setEditingPatient(undefined);
      setFormError(null);
      await fetchPatients(0, false, activeSearch);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save patient");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="patient-list">
      <div className="patient-list-header">
        <h1>Patients</h1>
        <div className="patient-list-actions">
          <button
            type="button"
            className="primary-button"
            onClick={openCreateForm}
            disabled={loading}
          >
            Add patient
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => fetchPatients()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <form className="patient-search" onSubmit={handleSearch}>
        <input
          type="search"
          className="patient-search-input"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search patients by name"
          aria-label="Search patients by name"
        />
        <button type="submit" className="primary-button" disabled={loading}>
          Search
        </button>
        {activeSearch && (
          <button
            type="button"
            className="secondary-button"
            onClick={clearSearch}
            disabled={loading}
          >
            Clear
          </button>
        )}
      </form>

      {error && <p className="patient-list-error">{error}</p>}

      {loading && patients.length === 0 ? (
        <p className="patient-list-status">Loading patients…</p>
      ) : patients.length === 0 ? (
        <p className="patient-list-status">
          {activeSearch
            ? `No patients found matching "${activeSearch}".`
            : "No patients found."}
        </p>
      ) : (
        <div className="patient-table-wrapper">
          <table className="patient-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date of birth</th>
                <th>Gender</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map(patient => (
                <tr key={patient.id}>
                  <td>
                    <button
                      type="button"
                      className="patient-name-link"
                      onClick={() => patient.id && onSelectPatient(patient.id)}
                    >
                      {formatName(patient.name)}
                    </button>
                  </td>
                  <td>{formatBirthDate(patient.birthDate)}</td>
                  <td>{formatGender(patient.gender)}</td>
                  <td className="patient-actions">
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => openEditForm(patient)}
                    >
                      Edit
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
          onClick={() => fetchPatients(offset, true, activeSearch)}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}

      {showForm && (
        <PatientForm
          patient={editingPatient}
          onSubmit={handleSave}
          onCancel={closeForm}
          saving={saving}
          error={formError}
        />
      )}
    </div>
  );
}
