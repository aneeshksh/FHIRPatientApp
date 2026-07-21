import { useState, type FormEvent } from "react";
import { CLINICAL_STATUS_OPTIONS, type ConditionFormValues } from "./fhirClinical";

type ConditionFormProps = {
  onSubmit: (values: ConditionFormValues) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
};

const emptyValues: ConditionFormValues = {
  codeText: "",
  clinicalStatus: "active",
  onsetDate: "",
};

function todayIsoDate(): string {
  const now = new Date();
  const localMidnight = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localMidnight.toISOString().slice(0, 10);
}

export function ConditionForm({ onSubmit, onCancel, saving, error }: ConditionFormProps) {
  const [values, setValues] = useState<ConditionFormValues>(emptyValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const update = <K extends keyof ConditionFormValues>(
    field: K,
    value: ConditionFormValues[K],
  ) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setValidationError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!values.codeText.trim()) {
      setValidationError("Condition name is required.");
      return;
    }

    if (!["active", "resolved", "inactive"].includes(values.clinicalStatus)) {
      setValidationError("Clinical status is required.");
      return;
    }

    if (!values.onsetDate || Number.isNaN(new Date(values.onsetDate).getTime())) {
      setValidationError("A valid onset date is required.");
      return;
    }

    if (values.onsetDate > todayIsoDate()) {
      setValidationError("Onset date cannot be in the future.");
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
        aria-labelledby="condition-form-title"
      >
        <div className="patient-form-header">
          <h2 id="condition-form-title">Add condition</h2>
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
            Condition name *
            <input
              type="text"
              value={values.codeText}
              onChange={e => update("codeText", e.target.value)}
              placeholder="e.g. Type 2 diabetes mellitus"
              disabled={saving}
              required
            />
          </label>

          <div className="form-row">
            <label>
              Clinical status *
              <select
                value={values.clinicalStatus}
                onChange={e =>
                  update("clinicalStatus", e.target.value as ConditionFormValues["clinicalStatus"])
                }
                disabled={saving}
              >
                {CLINICAL_STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Onset date *
              <input
                type="date"
                value={values.onsetDate}
                onChange={e => update("onsetDate", e.target.value)}
                max={todayIsoDate()}
                disabled={saving}
                required
              />
            </label>
          </div>

          {(validationError || error) && (
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
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving…" : "Add condition"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
