# Pharmacogenomics Demo Feature — Developer Notes

Source: CPIC database dump v1.59.1, loaded into Postgres and exported to CSV.
Scope: **6 genes** — CYP2C19, CYP2D6, SLCO1B1, TPMT, NUDT15, DPYD — mapped to 5 flagship
drugs: clopidogrel, codeine, simvastatin, azathioprine, fluorouracil.

(NUDT15 was added alongside TPMT after checking the data: CPIC's azathioprine rule
never fires on TPMT alone — it always requires TPMT + NUDT15 together. Dropping
NUDT15 would leave the TPMT demo path permanently non-functional, so it's included.)

---

## 1. Which file does what

| File | Rows | Use it for |
|---|---|---|
| `demo_phenotype_categories.csv` | 51 | Reference only. Every possible phenotype label per gene. Good for dropdowns/validation. |
| `demo_diplotype_to_phenotype.csv` | 23,248 | **Step 1 lookup.** Diplotype (e.g. `*1/*17`) → phenotype + activity score, per gene. |
| `demo_gene_drug_pairs.csv` | 124 | Reference only. Which gene affects which drug, and CPIC evidence level — use for "why does this matter" UI copy. |
| `demo_recommendations.csv` | 92 | **Step 2 lookup.** Phenotype/activity-score combination → CPIC prescribing text. |
| `allele_function.csv`, full `gene_drug_pairs.csv` / `diplotype_to_phenotype.csv` / `recommendations.csv` | full DB | Unfiltered. Only needed if you extend beyond the 6 genes later. Not required for this demo. |

You only need **`demo_diplotype_to_phenotype.csv`** and **`demo_recommendations.csv`** to run the matching logic. The rest is UI/reference support.

---

## 2. Important data quirk: two different key types

Check the `gene.lookupmethod` field — it splits the 6 genes into two groups, and this changes what you match on in Step 2:

| Genes | lookupmethod | What `recommendations.lookupkey` contains |
|---|---|---|
| CYP2C19, SLCO1B1, TPMT, NUDT15 | `PHENOTYPE` | Text label, e.g. `"Poor Metabolizer"`, `"Poor Function"` |
| **CYP2D6, DPYD** | `ACTIVITY_SCORE` | A **numeric string**, e.g. `"0.0"`, `"1.5"`, `"2.0"` — NOT the phenotype text |

Example — codeine's rules key on CYP2D6 activity score, not phenotype:
```
{"CYP2D6": "0.0"}   → Strong: avoid codeine
{"CYP2D6": "1.0"}   → Moderate: label-recommended dosing
```

This means your Step 1 output needs **both** the phenotype label and the `totalactivityscore` value per gene (both columns exist in `demo_diplotype_to_phenotype.csv`), and Step 2's matching logic needs to know, per gene, which of the two to compare against `lookupkey`. Don't assume phenotype text is always the match key — for CYP2D6 and DPYD it will silently never match if you do.

---

## 3. Important data quirk: `population` isn't always "general"

For 4 of the 5 demo drugs, `population` is always `"general"` — safe to ignore. **Clopidogrel is the exception**: it has 3 clinical-context populations (`CVI ACS PCI`, `CVI non-ACS non-PCI`, `NVI`) with genuinely different recommendations and classifications for the same CYP2C19 phenotype. For the demo, either:
- pick one population for clopidogrel and hardcode it (simplest — e.g. `NVI`, the broadest non-cardiac-intervention context), and note the simplification in the UI, or
- let the user pick a clinical context for clopidogrel specifically as a small demo of how nuanced real PGx guidance gets.

Recommend the first option to keep scope tight; mention the second as a "if I had more time" talking point.

---

## 4. Demo patient data to create

A demo patient record is a **diplotype per gene** (not raw variants — see §6 for why). This mirrors what a real lab report or PharmCAT output eventually hands you, so the interface is realistic even though values are hand-picked for now.

```json
{
  "patient_id": "demo-001",
  "name": "Demo Patient",
  "pgx_results": {
    "CYP2C19": "*1/*17",
    "CYP2D6": "*1/*4",
    "SLCO1B1": "*1/*5",
    "TPMT": "*1/*3A",
    "NUDT15": "*1/*1",
    "DPYD": "Reference/Reference"
  }
}
```

Three demo patients (all diplotypes confirmed to exist in `demo_diplotype_to_phenotype.csv`):

| Patient | CYP2C19 | CYP2D6 | SLCO1B1 | TPMT | NUDT15 | DPYD | Story |
|---|---|---|---|---|---|---|---|
| **A — Normal** | `*1/*1` | `*1/*1` | `*1/*1` | `*1/*1` | `*1/*1` | `Reference/Reference` | Baseline, no flags anywhere |
| **B — Cardiac risk** | `*2/*2` (Poor Metabolizer) | `*1/*1` | `*5/*5` (Poor Function) | `*1/*1` | `*1/*1` | `Reference/Reference` | Clopidogrel alt-therapy flag + simvastatin dose flag |
| **C — Thiopurine + opioid risk** | `*1/*1` | `*4/*4` (Poor Metabolizer) | `*1/*1` | `*3A/*3A` (Poor Metabolizer) | `*1/*1` | `Reference/Reference` | Codeine "avoid" flag + azathioprine "use alternative" flag |

B and C are the ones worth demoing — they produce visible, differentiated flags instead of "everything's fine."

---

## 5. Matching logic to implement

### Step 1 — Diplotype → Phenotype (+ activity score)
```python
def resolve_gene(gene, diplotype, diplotype_table):
    match = diplotype_table[
        (diplotype_table.genesymbol == gene) &
        (diplotype_table.diplotype == diplotype)
    ]
    if not len(match):
        return None  # unknown diplotype — flag in UI rather than silently skip
    row = match.iloc[0]
    return {"phenotype": row.phenotype, "activity_score": row.totalactivityscore}
```
⚠️ Diplotype strings are order-sensitive (`*1/*4` ≠ `*4/*1` as written in the table). Normalize patient input — e.g. try both orders, or always store alleles pre-sorted to match the table's convention.

Run once per gene → build a per-gene result dict, e.g.:
```json
{
  "CYP2C19": {"phenotype": "Poor Metabolizer", "activity_score": "n/a"},
  "CYP2D6":  {"phenotype": "Poor Metabolizer", "activity_score": "0.0"},
  ...
}
```

### Step 2 — Phenotype/Activity-score → Recommendation
```python
LOOKUP_METHOD = {  # from gene.lookupmethod
    "CYP2C19": "PHENOTYPE", "SLCO1B1": "PHENOTYPE",
    "TPMT": "PHENOTYPE", "NUDT15": "PHENOTYPE",
    "CYP2D6": "ACTIVITY_SCORE", "DPYD": "ACTIVITY_SCORE",
}

def get_recommendation(drug, patient_results, recommendations_table,
                        population_overrides=None):
    rows = recommendations_table[recommendations_table.drug_name == drug]
    for _, row in rows.iterrows():
        key = json.loads(row.lookupkey)          # e.g. {"TPMT": "Poor Metabolizer", "NUDT15": "Normal Metabolizer"}
        pop = population_overrides.get(drug) if population_overrides else "general"
        if row.population != pop:
            continue
        if row.classification == "No Recommendation":
            continue                              # CPIC has no guidance for this combo — treat as "nothing to flag", not a match
        if all(
            patient_results.get(gene, {}).get(
                "activity_score" if LOOKUP_METHOD.get(gene) == "ACTIVITY_SCORE" else "phenotype"
            ) == value
            for gene, value in key.items()
        ):
            return row   # use row.drugrecommendation + row.classification
    return None
```

Notes:
- **Multi-gene keys require every key in `lookupkey` to match** — this is why TPMT needs NUDT15 alongside it for azathioprine.
- Rows with `classification == "No Recommendation"` exist in the data (CPIC explicitly declining to give guidance for indeterminate/rare cases) — filter these out rather than surfacing them as a real recommendation.
- `classification` (Strong / Moderate / Optional / No Recommendation) is a good candidate for a colored badge.

### Step 3 — Render
Per patient, per gene:
1. Diplotype → phenotype (Step 1)
2. Affected drugs (join `demo_gene_drug_pairs.csv` on `genesymbol`)
3. Recommendation + classification badge (Step 2) for each affected drug

---

## 6. Worked example (validate your implementation against this)

Patient C, gene **TPMT** `*3A/*3A` + gene **NUDT15** `*1/*1`, drug **azathioprine**:

1. Step 1: TPMT → `Poor Metabolizer`; NUDT15 → `Normal Metabolizer`
2. Step 2: `demo_recommendations.csv`, `drug_name = azathioprine`, find row with `lookupkey = {"TPMT": "Poor Metabolizer", "NUDT15": "Normal Metabolizer"}`
   → `classification: Strong`, `drugrecommendation`: consider alternative nonthiopurine immunosuppressant therapy.
3. Step 3: red/strong flag rendered on azathioprine.

Second check — Patient C, gene **CYP2D6** `*4/*4`, drug **codeine**:
1. Step 1: CYP2D6 `*4/*4` → phenotype `Poor Metabolizer`, activity score `0.0`
2. Step 2: codeine keys on `ACTIVITY_SCORE`, so match against `{"CYP2D6": "0.0"}`, not the phenotype text
   → `classification: Strong`, `drugrecommendation`: avoid codeine, possibility of diminished analgesia.
3. Step 3: red/strong flag rendered on codeine.

---

## 7. What's intentionally NOT included (state this as a scope boundary in the demo)

- **No variant → star-allele resolution.** Real WGS output is raw variant calls, not diplotypes. Resolving those to star alleles needs the `allele_location_value` table (genomic coordinates per allele) plus phasing logic — this is what PharmCAT/Aldy/Cyrius actually do, and it's genuinely hard, especially for CYP2D6's structural variants. Demo patients have pre-assigned diplotypes rather than derived ones.
- **No coverage/quality handling.** Real pipelines flag "insufficient coverage to call this position confidently." Demo assumes clean, confident calls.
- **CPIC only** — DPWG and FDA label sources exist in the full DB under different tables but aren't wired into this CSV set.
- **Clopidogrel population handling simplified** to one clinical context (see §3).

Calling this scope boundary out explicitly in the demo (a small disclaimer banner, or just in your write-up) is good practice — and it's a solid talking point for a PM portfolio piece, since it shows you identified where the real engineering complexity lives even though you deliberately simplified for the MVP.
