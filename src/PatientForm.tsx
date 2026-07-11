import { useState, type FormEvent } from "react";
import {
  patientToFormValues,
  type Patient,
  type PatientFormValues,
} from "./fhirPatient";

type PatientFormProps = {
  patient?: Patient;
  onSubmit: (values: PatientFormValues) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
};

const emptyValues: PatientFormValues = {
  prefix: "",
  given: "",
  family: "",
  birthDate: "",
  gender: "",
  mrn: "",
};

export function PatientForm({
  patient,
  onSubmit,
  onCancel,
  saving,
  error,
}: PatientFormProps) {
  const [values, setValues] = useState<PatientFormValues>(() =>
    patient ? patientToFormValues(patient) : emptyValues,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const update = (field: keyof PatientFormValues, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setValidationError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!values.family.trim()) {
      setValidationError("Family name is required.");
      return;
    }

    if (!values.given.trim()) {
      setValidationError("Given name is required.");
      return;
    }

    await onSubmit(values);
  };

  const isEdit = Boolean(patient?.id);

  return (
    <div className="patient-form-overlay" onClick={onCancel}>
      <div
        className="patient-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-form-title"
      >
        <div className="patient-form-header">
          <h2 id="patient-form-title">{isEdit ? "Edit patient" : "Add patient"}</h2>
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
          <div className="form-row">
            <label>
              Prefix
              <select
                value={values.prefix}
                onChange={e => update("prefix", e.target.value)}
                disabled={saving}
              >
                <option value="">—</option>
                <option value="Mr.">Mr.</option>
                <option value="Mrs.">Mrs.</option>
                <option value="Ms.">Ms.</option>
                <option value="Dr.">Dr.</option>
                <option value="Prof.">Prof.</option>
              </select>
            </label>
            <label>
              Given name *
              <input
                type="text"
                value={values.given}
                onChange={e => update("given", e.target.value)}
                placeholder="First name"
                disabled={saving}
                required
              />
            </label>
          </div>

          <label>
            Family name *
            <input
              type="text"
              value={values.family}
              onChange={e => update("family", e.target.value)}
              placeholder="Last name"
              disabled={saving}
              required
            />
          </label>

          <div className="form-row">
            <label>
              Date of birth
              <input
                type="date"
                value={values.birthDate}
                onChange={e => update("birthDate", e.target.value)}
                disabled={saving}
              />
            </label>
            <label>
              Gender
              <select
                value={values.gender}
                onChange={e => update("gender", e.target.value)}
                disabled={saving}
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>

          <label>
            MRN
            <input
              type="text"
              value={values.mrn}
              onChange={e => update("mrn", e.target.value)}
              placeholder="Medical record number"
              disabled={saving}
            />
          </label>

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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create patient"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
