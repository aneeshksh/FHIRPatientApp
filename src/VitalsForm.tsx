import { useState, type FormEvent } from "react";
import { calculateBmi, type VitalsFormValues } from "./fhirClinical";

type VitalsFormProps = {
  onSubmit: (values: VitalsFormValues) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
};

type NumericFieldKey =
  | "systolic"
  | "diastolic"
  | "heartRate"
  | "temperature"
  | "respiratoryRate"
  | "oxygenSaturation"
  | "height"
  | "weight";

const FIELD_LABELS: Record<NumericFieldKey, string> = {
  systolic: "Systolic",
  diastolic: "Diastolic",
  heartRate: "Heart rate",
  temperature: "Temperature",
  respiratoryRate: "Respiratory rate",
  oxygenSaturation: "SpO2",
  height: "Height",
  weight: "Weight",
};

function nowLocalDatetimeValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function emptyValues(): VitalsFormValues {
  return {
    effectiveDateTime: nowLocalDatetimeValue(),
    systolic: "",
    diastolic: "",
    heartRate: "",
    temperature: "",
    respiratoryRate: "",
    oxygenSaturation: "",
    height: "",
    weight: "",
  };
}

export function VitalsForm({ onSubmit, onCancel, saving, error }: VitalsFormProps) {
  const [values, setValues] = useState<VitalsFormValues>(emptyValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const update = (field: keyof VitalsFormValues, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setValidationError(null);
  };

  const heightNum = Number(values.height.trim());
  const weightNum = Number(values.weight.trim());
  const previewBmi =
    values.height.trim() &&
    values.weight.trim() &&
    Number.isFinite(heightNum) &&
    heightNum > 0 &&
    Number.isFinite(weightNum) &&
    weightNum > 0
      ? calculateBmi(heightNum, weightNum)
      : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!values.effectiveDateTime) {
      setValidationError("Effective date/time is required.");
      return;
    }

    const effectiveDate = new Date(values.effectiveDateTime);
    if (Number.isNaN(effectiveDate.getTime())) {
      setValidationError("Effective date/time is invalid.");
      return;
    }

    if (effectiveDate.getTime() > Date.now()) {
      setValidationError("Effective date/time cannot be in the future.");
      return;
    }

    const fields: NumericFieldKey[] = [
      "systolic",
      "diastolic",
      "heartRate",
      "temperature",
      "respiratoryRate",
      "oxygenSaturation",
      "height",
      "weight",
    ];

    const parsed: Partial<Record<NumericFieldKey, number>> = {};
    for (const key of fields) {
      const trimmed = values[key].trim();
      if (!trimmed) continue;

      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        setValidationError(`${FIELD_LABELS[key]} must be a valid number.`);
        return;
      }
      if (n <= 0) {
        setValidationError(`${FIELD_LABELS[key]} must be greater than 0.`);
        return;
      }
      parsed[key] = n;
    }

    if (Object.keys(parsed).length === 0) {
      setValidationError("Enter at least one vital reading.");
      return;
    }

    if (
      parsed.systolic !== undefined &&
      parsed.diastolic !== undefined &&
      parsed.systolic <= parsed.diastolic
    ) {
      setValidationError("Systolic must be greater than diastolic.");
      return;
    }

    if (parsed.oxygenSaturation !== undefined && parsed.oxygenSaturation > 100) {
      setValidationError("SpO2 cannot be greater than 100%.");
      return;
    }

    const warnings: string[] = [];
    if (parsed.oxygenSaturation !== undefined && parsed.oxygenSaturation < 70) {
      warnings.push(`SpO2 of ${parsed.oxygenSaturation}% is critically low.`);
    }
    if (parsed.temperature !== undefined && (parsed.temperature < 25 || parsed.temperature > 45)) {
      warnings.push(`Temperature of ${parsed.temperature}°C is outside the typical 25–45°C range.`);
    }
    if (parsed.heartRate !== undefined && (parsed.heartRate < 20 || parsed.heartRate > 250)) {
      warnings.push(`Heart rate of ${parsed.heartRate} bpm is outside the typical 20–250 bpm range.`);
    }
    if (parsed.systolic !== undefined && (parsed.systolic < 40 || parsed.systolic > 260)) {
      warnings.push(`Systolic of ${parsed.systolic} mmHg is outside the typical 40–260 mmHg range.`);
    }
    if (parsed.diastolic !== undefined && (parsed.diastolic < 20 || parsed.diastolic > 150)) {
      warnings.push(`Diastolic of ${parsed.diastolic} mmHg is outside the typical 20–150 mmHg range.`);
    }

    if (warnings.length > 0) {
      const proceed = window.confirm(`${warnings.join("\n")}\n\nSave this reading anyway?`);
      if (!proceed) return;
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
        aria-labelledby="vitals-form-title"
      >
        <div className="patient-form-header">
          <h2 id="vitals-form-title">Add vitals</h2>
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
            Effective date/time *
            <input
              type="datetime-local"
              value={values.effectiveDateTime}
              onChange={e => update("effectiveDateTime", e.target.value)}
              max={nowLocalDatetimeValue()}
              disabled={saving}
              required
            />
          </label>

          <div className="form-row">
            <label>
              Systolic (mmHg)
              <input
                type="number"
                value={values.systolic}
                onChange={e => update("systolic", e.target.value)}
                disabled={saving}
              />
            </label>
            <label>
              Diastolic (mmHg)
              <input
                type="number"
                value={values.diastolic}
                onChange={e => update("diastolic", e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Heart rate (bpm)
              <input
                type="number"
                value={values.heartRate}
                onChange={e => update("heartRate", e.target.value)}
                disabled={saving}
              />
            </label>
            <label>
              Temperature (°C)
              <input
                type="number"
                step="0.1"
                value={values.temperature}
                onChange={e => update("temperature", e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Respiratory rate (breaths/min)
              <input
                type="number"
                value={values.respiratoryRate}
                onChange={e => update("respiratoryRate", e.target.value)}
                disabled={saving}
              />
            </label>
            <label>
              SpO2 (%)
              <input
                type="number"
                value={values.oxygenSaturation}
                onChange={e => update("oxygenSaturation", e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Height (cm)
              <input
                type="number"
                step="0.1"
                value={values.height}
                onChange={e => update("height", e.target.value)}
                disabled={saving}
              />
            </label>
            <label>
              Weight (kg)
              <input
                type="number"
                step="0.1"
                value={values.weight}
                onChange={e => update("weight", e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          {previewBmi !== null && (
            <p className="vitals-form-bmi-preview">Calculated BMI: {previewBmi.toFixed(1)} kg/m²</p>
          )}

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
              {saving ? "Saving…" : "Add vitals"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
