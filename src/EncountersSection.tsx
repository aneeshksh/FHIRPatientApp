import type { Encounter } from "./fhirEncounter";
import { encounterDate, extractSoapNote } from "./fhirEncounter";

type EncountersSectionProps = { encounters: Encounter[] };

function formatDateTime(date?: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function preview(encounter: Encounter): string {
  const soap = extractSoapNote(encounter);
  const text = soap.assessment || soap.subjective || soap.objective || soap.plan;
  if (!text) return "No notes recorded.";
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export function EncountersSection({ encounters }: EncountersSectionProps) {
  const sorted = [...encounters].sort((a, b) => {
    const dateA = encounterDate(a) ?? "";
    const dateB = encounterDate(b) ?? "";
    return dateB.localeCompare(dateA);
  });

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>Encounters</h2>
      </div>

      {sorted.length === 0 ? (
        <p className="patient-list-status">No encounters recorded.</p>
      ) : (
        <div className="detail-scroll-list">
          <ul className="condition-list">
            {sorted.map(encounter => (
              <li key={encounter.id} className="condition-item">
                <span className="condition-name">{preview(encounter)}</span>
                <span className="condition-date">
                  {formatDateTime(encounterDate(encounter))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
