import { useState, type FormEvent } from "react";
import type { MedicationRequestFormValues } from "./fhirClinical";

type MedicationFormProps = {
  onSubmit: (values: MedicationRequestFormValues) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
};

const emptyValues: MedicationRequestFormValues = {
  codeText: "",
  startDate: "",
  endDate: "",
};

function todayIsoDate(): string {
  const now = new Date();
  const localMidnight = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localMidnight.toISOString().slice(0, 10);
}

export function MedicationForm({ onSubmit, onCancel, saving, error }: MedicationFormProps) {
  const [values, setValues] = useState<MedicationRequestFormValues>(emptyValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const update = <K extends keyof MedicationRequestFormValues>(
    field: K,
    value: MedicationRequestFormValues[K],
  ) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setValidationError(null);
  };

  // Live, not just on submit — the end date is compared to the start date on
  // every render so the error shows as soon as the two disagree.
  const dateOrderError =
    values.startDate && values.endDate && values.endDate < values.startDate
      ? "End date cannot be before the start date."
      : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!values.codeText.trim()) {
      setValidationError("Medication name is required.");
      return;
    }

    if (!values.startDate || Number.isNaN(new Date(values.startDate).getTime())) {
      setValidationError("A valid start date is required.");
      return;
    }

    if (values.startDate > todayIsoDate()) {
      setValidationError("Start date cannot be in the future.");
      return;
    }

    if (dateOrderError) {
      setValidationError(dateOrderError);
      return;
    }

    await onSubmit(values);
  };

  return (
    <div className="patient-form-overlay" onClick={onCancel}>
      <div
        className="patient-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="medication-form-title"
      >
        <div className="patient-form-header">
          <h2 id="medication-form-title">Add medication</h2>
          <button
            type="button"
            className="patient-form-close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="patient-form">
          <label>
            Medication name *
            <input
              type="text"
              value={values.codeText}
              onChange={e => update("codeText", e.target.value)}
              placeholder="e.g. Metformin 500mg"
              disabled={saving}
              required
            />
          </label>

          <div className="form-row">
            <label>
              Start date *
              <input
                type="date"
                value={values.startDate}
                onChange={e => update("startDate", e.target.value)}
                max={todayIsoDate()}
                disabled={saving}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={values.endDate}
                onChange={e => update("endDate", e.target.value)}
                min={values.startDate || undefined}
                disabled={saving}
              />
            </label>
          </div>

          {dateOrderError && <p className="patient-form-error">{dateOrderError}</p>}

          {(validationError || error) && !dateOrderError && (
            <p className="patient-form-error">{validationError ?? error}</p>
          )}

          <div className="patient-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving || Boolean(dateOrderError)}>
              {saving ? "Saving…" : "Add medication"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
