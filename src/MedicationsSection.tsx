import { useState } from "react";
import {
  createMedicationRequest,
  getMedicationDisplay,
  getMedicationEndDate,
  getMedicationStartDate,
  type Medication,
  type MedicationRequest,
  type MedicationRequestFormValues,
} from "./fhirClinical";
import { MedicationForm } from "./MedicationForm";

type MedicationsSectionProps = {
  medicationRequests: MedicationRequest[];
  medicationsById: Map<string, Medication>;
  patientId: string;
  onMedicationAdded: (request: MedicationRequest) => void;
};

function formatDate(date?: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MedicationsSection({
  medicationRequests,
  medicationsById,
  patientId,
  onMedicationAdded,
}: MedicationsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const active = medicationRequests
    .filter(mr => mr.status === "active")
    .sort((a, b) =>
      (getMedicationStartDate(b) ?? "").localeCompare(getMedicationStartDate(a) ?? ""),
    );

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setFormError(null);
  };

  const handleSubmit = async (values: MedicationRequestFormValues) => {
    setSaving(true);
    setFormError(null);

    try {
      const created = await createMedicationRequest(patientId, values);
      onMedicationAdded(created);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save medication");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>Current Medications</h2>
        <button type="button" className="primary-button" onClick={() => setShowForm(true)}>
          Add medication
        </button>
      </div>

      {active.length === 0 ? (
        <p className="patient-list-status">No current medications.</p>
      ) : (
        <div className="detail-scroll-list">
          <ul className="medication-list">
            {active.map(request => {
              const endDate = getMedicationEndDate(request);
              return (
                <li key={request.id} className="medication-item">
                  <span className="medication-name">
                    {getMedicationDisplay(request, medicationsById)}
                  </span>
                  <span className="medication-meta">
                    Since {formatDate(getMedicationStartDate(request))}
                    {endDate ? ` – ${formatDate(endDate)}` : ""}
                    {request.requester?.display ? ` · ${request.requester.display}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showForm && (
        <MedicationForm
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          error={formError}
        />
      )}
    </section>
  );
}
