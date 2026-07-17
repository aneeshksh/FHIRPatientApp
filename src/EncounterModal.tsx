import { useState, type FormEvent } from "react";
import { createEncounter, type SoapNote } from "./fhirEncounter";

type EncounterModalProps = {
  patientId: string;
  practitionerId: string;
  appointmentId?: string;
  onClose: () => void;
  onSaved: () => void;
};

const emptyNote: SoapNote = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

export function EncounterModal({
  patientId,
  practitionerId,
  appointmentId,
  onClose,
  onSaved,
}: EncounterModalProps) {
  const [soap, setSoap] = useState<SoapNote>(emptyNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof SoapNote, value: string) => {
    setSoap(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const hasContent = Object.values(soap).some(v => v.trim());
    if (!hasContent) {
      setError("Enter at least one SOAP section.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createEncounter({ patientId, practitionerId, appointmentId, soap });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save encounter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="patient-form-overlay" onClick={onClose}>
      <div
        className="patient-form-panel encounter-modal-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="encounter-modal-title"
      >
        <div className="patient-form-header">
          <h2 id="encounter-modal-title">New encounter</h2>
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
            Subjective
            <textarea
              rows={3}
              value={soap.subjective}
              onChange={e => update("subjective", e.target.value)}
              disabled={saving}
            />
          </label>

          <label>
            Objective
            <textarea
              rows={3}
              value={soap.objective}
              onChange={e => update("objective", e.target.value)}
              disabled={saving}
            />
          </label>

          <label>
            Assessment
            <textarea
              rows={3}
              value={soap.assessment}
              onChange={e => update("assessment", e.target.value)}
              disabled={saving}
            />
          </label>

          <label>
            Plan
            <textarea
              rows={3}
              value={soap.plan}
              onChange={e => update("plan", e.target.value)}
              disabled={saving}
            />
          </label>

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
              {saving ? "Saving…" : "Save encounter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
