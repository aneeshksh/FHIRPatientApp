import { useState } from "react";
import { VitalsChart, type ChartSeries } from "./VitalsChart";
import { createVitalObservations, type Observation, type VitalRow, type VitalsFormValues } from "./fhirClinical";
import { VitalsForm } from "./VitalsForm";

type VitalsSectionProps = {
  rows: VitalRow[];
  patientId: string;
  onVitalsAdded: (observations: Observation[]) => void;
};

type MetricKey =
  | "heartRate"
  | "temperature"
  | "respiratoryRate"
  | "oxygenSaturation"
  | "height"
  | "weight"
  | "bmi";

type MetricDef = {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  decimals: number;
};

const METRICS: MetricDef[] = [
  { key: "heartRate", label: "Heart Rate", unit: "/min", color: "#ea2c00", decimals: 0 },
  { key: "temperature", label: "Temperature", unit: "°C", color: "#ff5832", decimals: 1 },
  { key: "respiratoryRate", label: "Respiratory Rate", unit: "/min", color: "#76a8f4", decimals: 0 },
  { key: "oxygenSaturation", label: "Oxygen Saturation", unit: "%", color: "#3d6fc7", decimals: 0 },
  { key: "height", label: "Height", unit: "cm", color: "#a7988a", decimals: 1 },
  { key: "weight", label: "Weight", unit: "kg", color: "#6d645a", decimals: 1 },
  { key: "bmi", label: "BMI", unit: "kg/m²", color: "#c02907", decimals: 1 },
];

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatValue(value: number | undefined, decimals: number): string {
  return value === undefined ? "—" : value.toFixed(decimals);
}

export function VitalsSection({ rows, patientId, onVitalsAdded }: VitalsSectionProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const sortedAsc = [...rows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const sortedDesc = [...sortedAsc].reverse();

  const bpSeries: ChartSeries[] = [
    {
      label: "Systolic",
      color: "#ea2c00",
      points: sortedAsc
        .filter(r => r.systolic !== undefined)
        .map(r => ({ date: r.date, value: r.systolic! })),
    },
    {
      label: "Diastolic",
      color: "#76a8f4",
      points: sortedAsc
        .filter(r => r.diastolic !== undefined)
        .map(r => ({ date: r.date, value: r.diastolic! })),
    },
  ];

  const latestBp = sortedDesc.find(r => r.systolic !== undefined || r.diastolic !== undefined);

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setFormError(null);
  };

  const handleSubmit = async (values: VitalsFormValues) => {
    setSaving(true);
    setFormError(null);

    try {
      const created = await createVitalObservations(patientId, values);
      onVitalsAdded(created);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save vitals");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>Vital Signs</h2>
        <div className="vitals-section-actions">
          <button type="button" className="primary-button" onClick={() => setShowForm(true)}>
            Add vitals
          </button>
          <div className="view-toggle">
            <button
              type="button"
              className={view === "chart" ? "toggle-button active" : "toggle-button"}
              onClick={() => setView("chart")}
            >
              Chart
            </button>
            <button
              type="button"
              className={view === "table" ? "toggle-button active" : "toggle-button"}
              onClick={() => setView("table")}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="patient-list-status">No vitals recorded.</p>
      ) : view === "chart" ? (
        <div className="vitals-grid">
          <div className="vitals-card">
            <div className="vitals-card-header">
              <h3>Blood Pressure</h3>
              <span className="vitals-card-latest">
                {latestBp
                  ? `${latestBp.systolic ?? "—"}/${latestBp.diastolic ?? "—"} mmHg`
                  : "—"}
              </span>
            </div>
            <VitalsChart series={bpSeries} unit="mmHg" />
          </div>

          {METRICS.map(metric => {
            const points = sortedAsc
              .filter(r => r[metric.key] !== undefined)
              .map(r => ({ date: r.date, value: r[metric.key] as number }));
            const latest = points[points.length - 1];

            return (
              <div className="vitals-card" key={metric.key}>
                <div className="vitals-card-header">
                  <h3>{metric.label}</h3>
                  <span className="vitals-card-latest">
                    {latest ? `${formatValue(latest.value, metric.decimals)} ${metric.unit}` : "—"}
                  </span>
                </div>
                <VitalsChart
                  series={[{ label: metric.label, color: metric.color, points }]}
                  unit={metric.unit}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="vitals-table-wrapper">
          <table className="vitals-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Systolic</th>
                <th>Diastolic</th>
                <th>Heart Rate</th>
                <th>Temp (°C)</th>
                <th>Resp. Rate</th>
                <th>SpO₂ (%)</th>
                <th>Height (cm)</th>
                <th>Weight (kg)</th>
                <th>BMI</th>
              </tr>
            </thead>
            <tbody>
              {sortedDesc.map(row => (
                <tr key={row.date}>
                  <td>{formatDate(row.date)}</td>
                  <td>{formatValue(row.systolic, 0)}</td>
                  <td>{formatValue(row.diastolic, 0)}</td>
                  <td>{formatValue(row.heartRate, 0)}</td>
                  <td>{formatValue(row.temperature, 1)}</td>
                  <td>{formatValue(row.respiratoryRate, 0)}</td>
                  <td>{formatValue(row.oxygenSaturation, 0)}</td>
                  <td>{formatValue(row.height, 1)}</td>
                  <td>{formatValue(row.weight, 1)}</td>
                  <td>{formatValue(row.bmi, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <VitalsForm
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          error={formError}
        />
      )}
    </section>
  );
}
