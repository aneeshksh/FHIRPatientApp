import { useState, type FormEvent } from "react";
import { createAppointment } from "./fhirAppointment";
import { formatName, type Patient } from "./fhirPatient";

const DEFAULT_DURATION_MINUTES = 30;

type AppointmentFormProps = {
  practitionerId: string;
  patients: Patient[];
  defaultDate?: string;
  onClose: () => void;
  onCreated: () => void;
};

export function AppointmentForm({
  practitionerId,
  patients,
  defaultDate,
  onClose,
  onCreated,
}: AppointmentFormProps) {
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(defaultDate ?? "");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!patientId || !date || !time) {
      setError("Patient, date, and time are required.");
      return;
    }

    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) {
      setError("Invalid date or time.");
      return;
    }
    const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

    setSaving(true);
    setError(null);

    try {
      await createAppointment({
        patientId,
        practitionerId,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create appointment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="patient-form-overlay" onClick={onClose}>
      <div
        className="patient-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-form-title"
      >
        <div className="patient-form-header">
          <h2 id="appointment-form-title">New appointment</h2>
          <button
            type="button"
            className="patient-form-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="patient-form">
          <label>
            Patient *
            <select
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              disabled={saving}
              required
            >
              <option value="" disabled>
                Select a patient
              </option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>
                  {formatName(p.name)}
                </option>
              ))}
            </select>
          </label>

          <div className="form-row">
            <label>
              Date *
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                disabled={saving}
                required
              />
            </label>
            <label>
              Time *
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                disabled={saving}
                required
              />
            </label>
          </div>

          {error && <p className="patient-form-error">{error}</p>}

          <div className="patient-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Creating…" : "Create appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
