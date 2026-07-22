import { useEffect, useState, type FormEvent } from "react";
import type { Patient } from "fhir/r4";
// Direct file imports, not the src/services/pgx barrel — the barrel also
// re-exports loadPgxData, which reads CSVs via Bun.file and has no business
// being pulled into the browser bundle (same reasoning as
// PgxInteractionsSection.tsx).
import { getPatientPgxDiplotypes } from "./services/pgx/patientDiplotypes";
import { PGX_GENES, type PgxGene } from "./services/pgx/types";
import {
  describeDiplotypeErrors,
  isPlainStringRecord,
  validateDiplotypesAgainstOptions,
} from "./services/pgx/validateDiplotypes";
import { DEMO_PATIENT_B_PGX_PROFILE } from "./services/pgx/demoProfiles";
import { fetchPgxGeneOptions } from "./pgxClient";

type PgxProfileFormProps = {
  patient: Patient;
  onSubmit: (diplotypes: Record<string, string>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
};

// Distinct from any real diplotype value (those are things like "*1/*17" or
// "Reference/Reference" — never an empty string), so it's safe as the
// per-gene "nothing selected" sentinel.
const NONE_VALUE = "";

function initialDropdownValues(existing: Record<string, string>): Record<PgxGene, string> {
  const values = {} as Record<PgxGene, string>;
  for (const gene of PGX_GENES) {
    values[gene] = existing[gene] ?? NONE_VALUE;
  }
  return values;
}

export function PgxProfileForm({ patient, onSubmit, onCancel, saving, error }: PgxProfileFormProps) {
  const existing = getPatientPgxDiplotypes(patient) ?? {};
  const isEdit = Object.keys(existing).length > 0;

  const [optionsByGene, setOptionsByGene] = useState<Record<string, string[]> | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [dropdownValues, setDropdownValues] = useState<Record<PgxGene, string>>(() =>
    initialDropdownValues(existing),
  );

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState(() =>
    isEdit ? JSON.stringify(existing, null, 2) : "",
  );
  // Only a user edit to the textarea counts as "the advanced path has a
  // value" for override purposes — the pre-fill above is there purely "for
  // convenience" per the ticket, not to silently steal precedence over
  // dropdown changes the user makes without ever opening Advanced.
  const [jsonDirty, setJsonDirty] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPgxGeneOptions()
      .then(options => {
        if (!cancelled) setOptionsByGene(options);
      })
      .catch(err => {
        if (!cancelled) {
          setOptionsError(err instanceof Error ? err.message : "Failed to load gene options");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateDropdown = (gene: PgxGene, value: string) => {
    setDropdownValues(prev => ({ ...prev, [gene]: value }));
    setValidationError(null);
  };

  // ANE-36: quick-fill only — never auto-submits. Reuses the exact Demo
  // Patient B values ANE-31's seed script sources, via the shared
  // demoProfiles.ts constant, so this can't drift from what that script
  // seeds (or from what's already validated against the diplotype table).
  // Overwrites both the dropdowns and, if the advanced section is open, the
  // JSON textarea too, so the two inputs never show conflicting values.
  const handleLoadDemoData = () => {
    setDropdownValues({ ...DEMO_PATIENT_B_PGX_PROFILE } as Record<PgxGene, string>);
    if (showAdvanced) {
      setJsonText(JSON.stringify(DEMO_PATIENT_B_PGX_PROFILE, null, 2));
    }
    setValidationError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedJson = jsonText.trim();

    if (jsonDirty && trimmedJson) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmedJson);
      } catch {
        setValidationError("Advanced JSON is not valid JSON.");
        return;
      }

      if (!isPlainStringRecord(parsed)) {
        setValidationError("Advanced JSON must be a flat object of gene -> diplotype strings.");
        return;
      }

      if (Object.keys(parsed).length === 0) {
        setValidationError("Advanced JSON must include at least one gene.");
        return;
      }

      if (!optionsByGene) {
        setValidationError("Gene data is still loading — try again in a moment.");
        return;
      }

      const errors = validateDiplotypesAgainstOptions(optionsByGene, parsed);
      if (errors.length > 0) {
        setValidationError(`Invalid diplotype value(s): ${describeDiplotypeErrors(errors)}.`);
        return;
      }

      await onSubmit(parsed);
      return;
    }

    const fromDropdowns: Record<string, string> = {};
    for (const gene of PGX_GENES) {
      if (dropdownValues[gene] !== NONE_VALUE) fromDropdowns[gene] = dropdownValues[gene];
    }

    if (Object.keys(fromDropdowns).length === 0) {
      setValidationError(
        "Select at least one gene's diplotype, or use the advanced JSON option below.",
      );
      return;
    }

    await onSubmit(fromDropdowns);
  };

  return (
    <div className="patient-form-overlay" onClick={onCancel}>
      <div
        className="patient-form-panel pgx-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pgx-form-title"
      >
        <div className="patient-form-header">
          <h2 id="pgx-form-title">{isEdit ? "Edit PGx profile" : "Add PGx profile"}</h2>
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
          <p className="pgx-form-hint">
            Pick a diplotype per gene from lab results. Every gene is optional — leave it as "None
            selected" if it wasn't tested — but at least one is required to save.
          </p>

          <div className="pgx-demo-fill-row">
            <button
              type="button"
              className="demo-fill-button"
              onClick={handleLoadDemoData}
              disabled={saving}
            >
              <span aria-hidden="true">🧪</span> Load Demo Data
            </button>
            <span className="pgx-form-hint">
              Fills Demo Patient B (Cardiac Risk) — CYP2C19 *2/*2 flags clopidogrel, SLCO1B1 *5/*5
              flags simvastatin. Review, then click Save to apply.
            </span>
          </div>

          {optionsError ? (
            <p className="patient-form-error">
              Failed to load gene options ({optionsError}). Diplotype dropdowns are unavailable —
              use the advanced JSON option below instead.
            </p>
          ) : (
            <div className="pgx-gene-grid">
              {PGX_GENES.map(gene => (
                <label key={gene}>
                  {gene}
                  <select
                    value={dropdownValues[gene]}
                    onChange={e => updateDropdown(gene, e.target.value)}
                    disabled={saving || !optionsByGene}
                  >
                    <option value={NONE_VALUE}>{optionsByGene ? "None selected" : "Loading…"}</option>
                    {optionsByGene?.[gene]?.map(diplotype => (
                      <option key={diplotype} value={diplotype}>
                        {diplotype}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <details
            className="pgx-advanced"
            open={showAdvanced}
            onToggle={e => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary>Advanced: paste raw data</summary>
            <label>
              Diplotype JSON
              <textarea
                rows={6}
                value={jsonText}
                onChange={e => {
                  setJsonText(e.target.value);
                  setJsonDirty(true);
                  setValidationError(null);
                }}
                placeholder='{"CYP2C19": "*1/*17", "CYP2D6": "*1/*4"}'
                disabled={saving}
                spellCheck={false}
              />
            </label>
            <p className="pgx-form-hint">
              If edited, this replaces the dropdown selections entirely when saving.
            </p>
          </details>

          {(validationError || error) && (
            <p className="patient-form-error">{validationError ?? error}</p>
          )}

          <div className="patient-form-actions">
            <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving…" : "Save PGx profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
