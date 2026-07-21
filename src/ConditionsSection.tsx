import type { Condition } from "./fhirClinical";

type ConditionsSectionProps = { conditions: Condition[] };

function getConditionName(condition: Condition): string {
  return condition.code?.text ?? condition.code?.coding?.[0]?.display ?? "Unknown condition";
}

function getClinicalStatus(condition: Condition): string {
  return condition.clinicalStatus?.coding?.[0]?.code ?? "unknown";
}

function formatDate(date?: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ConditionsSection({ conditions }: ConditionsSectionProps) {
  const sorted = [...conditions].sort((a, b) => {
    const dateA = a.onsetDateTime ?? a.recordedDate ?? "";
    const dateB = b.onsetDateTime ?? b.recordedDate ?? "";
    return dateB.localeCompare(dateA);
  });

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>Conditions</h2>
      </div>

      {sorted.length === 0 ? (
        <p className="patient-list-status">No conditions recorded.</p>
      ) : (
        <div className="detail-scroll-list">
          <ul className="condition-list">
            {sorted.map(condition => {
              const status = getClinicalStatus(condition);
              return (
                <li key={condition.id} className="condition-item">
                  <span className="condition-name">{getConditionName(condition)}</span>
                  <span className={`status-badge status-${status}`}>{status}</span>
                  <span className="condition-date">
                    Onset {formatDate(condition.onsetDateTime ?? condition.recordedDate)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
