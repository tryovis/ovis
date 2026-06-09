// utils/indexBy.mjs

/**
 * Baut einen schnellen Lookup-Index für Rows.
 *
 * Beispiel:
 * const byPatientId = indexBy(tzpiRows, "TZ_P_PID");
 * const row = byPatientId.get("12345898");
 */
export function indexBy(rows, keyName) {
  const index = new Map();

  for (const row of rows) {
    const key = row[keyName];

    if (key === null || key === undefined || key === "") {
      continue;
    }

    index.set(String(key).trim(), row);
  }

  return index;
}