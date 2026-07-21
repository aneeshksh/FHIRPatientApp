import { useState, type ChangeEvent } from "react";
import {
  CLINICAL_STATUS_OPTIONS,
  createCondition,
  getConditionClinicalStatus,
  groupConditionsByStatus,
  updateConditionStatus,
  type ClinicalStatusCode,
  type Condition,
  type ConditionFormValues,
} from "./fhirClinical";
import { ConditionForm } from "./ConditionForm";

type ConditionsSectionProps = {
  conditions: Condition[];
  patientId: string;
  onConditionAdded: (condition: Condition) => void;
  onConditionUpdated: (condition: Condition) => void;
};

function getConditionName(condition: Condition): string {
  return condition.code?.text ?? condition.code?.coding?.[0]?.display ?? "Unknown condition";
}

function formatDate(date?: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sortByOnset(conditions: Condition[]): Condition[] {
  return [...conditions].sort((a, b) => {
    const dateA = a.onsetDateTime ?? a.recordedDate ?? "";
    const dateB = b.onsetDateTime ?? b.recordedDate ?? "";
    return dateB.localeCompare(dateA);
  });
}

const KNOWN_STATUSES = new Set(CLINICAL_STATUS_OPTIONS.map(o => o.value));

// Only an active → resolved/inactive transition gets a confirm — it's the
// one easy-misclick direction (moves a condition out of Active); every
// other transition applies immediately.
function needsConfirm(from: string, to: ClinicalStatusCode): boolean {
  return from === "active" && (to === "resolved" || to === "inactive");
}

function ConditionRow({
  condition,
  onStatusChange,
}: {
  condition: Condition;
  onStatusChange: (condition: Condition, status: ClinicalStatusCode) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = getConditionClinicalStatus(condition);

  const handleChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as ClinicalStatusCode;
    if (nextStatus === status) return;

    if (needsConfirm(status, nextStatus)) {
      const confirmed = window.confirm(
        `Mark "${getConditionName(condition)}" as ${nextStatus}? It will move out of Active conditions.`,
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError(null);
    try {
      await onStatusChange(condition, nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update condition");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="condition-item">
      <span className="condition-name">{getConditionName(condition)}</span>
      {KNOWN_STATUSES.has(status as ClinicalStatusCode) ? (
        <select
          className={`status-select status-${status}`}
          value={status}
          onChange={handleChange}
          disabled={saving}
          aria-label={`Clinical status for ${getConditionName(condition)}`}
        >
          {CLINICAL_STATUS_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <span className={`status-badge status-${status}`}>{status}</span>
      )}
      <span className="condition-date">
        Onset {formatDate(condition.onsetDateTime ?? condition.recordedDate)}
      </span>
      {error && <span className="condition-row-error">{error}</span>}
    </li>
  );
}

function ConditionGroupList({
  conditions,
  emptyMessage,
  onStatusChange,
}: {
  conditions: Condition[];
  emptyMessage: string;
  onStatusChange: (condition: Condition, status: ClinicalStatusCode) => Promise<void>;
}) {
  if (conditions.length === 0) {
    return <p className="patient-list-status">{emptyMessage}</p>;
  }

  return (
    <div className="detail-scroll-list">
      <ul className="condition-list">
        {sortByOnset(conditions).map(condition => (
          <ConditionRow key={condition.id} condition={condition} onStatusChange={onStatusChange} />
        ))}
      </ul>
    </div>
  );
}

export function ConditionsSection({
  conditions,
  patientId,
  onConditionAdded,
  onConditionUpdated,
}: ConditionsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { active, historical } = groupConditionsByStatus(conditions);

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setFormError(null);
  };

  const handleSubmit = async (values: ConditionFormValues) => {
    setSaving(true);
    setFormError(null);

    try {
      const created = await createCondition(patientId, values);
      onConditionAdded(created);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save condition");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (condition: Condition, status: ClinicalStatusCode) => {
    if (!condition.id) return;
    const updated = await updateConditionStatus(condition.id, status);
    onConditionUpdated(updated);
  };

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>Conditions</h2>
        <button type="button" className="primary-button" onClick={() => setShowForm(true)}>
          Add condition
        </button>
      </div>

      <div className="condition-subsection">
        <h3 className="condition-subsection-title">Active</h3>
        <ConditionGroupList
          conditions={active}
          emptyMessage="No active conditions."
          onStatusChange={handleStatusChange}
        />
      </div>

      <div className="condition-subsection">
        <h3 className="condition-subsection-title">Historical</h3>
        <ConditionGroupList
          conditions={historical}
          emptyMessage="No historical conditions."
          onStatusChange={handleStatusChange}
        />
      </div>

      {showForm && (
        <ConditionForm
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          error={formError}
        />
      )}
    </section>
  );
}
