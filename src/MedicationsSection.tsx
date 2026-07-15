import { getMedicationDisplay, type Medication, type MedicationRequest } from "./fhirClinical";

type MedicationsSectionProps = {
  medicationRequests: MedicationRequest[];
  medicationsById: Map<string, Medication>;
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
}: MedicationsSectionProps) {
  const active = medicationRequests
    .filter(mr => mr.status === "active")
    .sort((a, b) => (b.authoredOn ?? "").localeCompare(a.authoredOn ?? ""));

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>Current Medications</h2>
      </div>

      {active.length === 0 ? (
        <p className="patient-list-status">No current medications.</p>
      ) : (
        <ul className="medication-list">
          {active.map(request => (
            <li key={request.id} className="medication-item">
              <span className="medication-name">
                {getMedicationDisplay(request, medicationsById)}
              </span>
              <span className="medication-meta">
                Since {formatDate(request.authoredOn)}
                {request.requester?.display ? ` · ${request.requester.display}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
