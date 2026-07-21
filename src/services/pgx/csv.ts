// Minimal RFC4180 CSV parser. The demo CSVs have quoted fields with embedded
// commas (e.g. DPYD diplotypes like `"c.1129-5923C>G, c.1236G>A (HapB3)/Reference"`)
// and the recommendations `lookupkey` column is a JSON object CSV-escaped as
// a quoted field (`""` -> `"`) — naive `line.split(",")` corrupts both.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (char === "\r") {
      i += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(r => !(r.length === 1 && r[0] === ""));
}

export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0]!;
  const dataRows = rows.slice(1);
  return dataRows.map(row => {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = row[idx] ?? "";
    });
    return record;
  });
}

// noUncheckedIndexedAccess makes Record<string, string> access come back
// `string | undefined` even via dot notation; every column is guaranteed
// present (parseCsvRecords fills missing trailing fields with "") so this
// is just a typed, defaulted accessor rather than an unsafe assertion.
export function field(record: Record<string, string>, key: string): string {
  return record[key] ?? "";
}
