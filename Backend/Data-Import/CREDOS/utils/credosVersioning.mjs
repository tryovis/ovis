// utils/credosVersioning.mjs

/**
 * Bereinigt CREDOS-Rows anhand von Dokumentnummer und Dokumentversion.
 *
 * Hintergrund:
 * Manche CREDOS-Files enthalten mehrere Versionen desselben Dokuments.
 * Über DOKNR wird das Dokument identifiziert.
 * Über DOKVR wird die Version erkannt.
 *
 * Zusätzlich können Rows ein Löschkennzeichen enthalten, z.B. TZ_LOEKZ.
 *
 * Regel:
 * - Pro DOKNR wird nur die Row mit der höchsten DOKVR behalten.
 * - Wenn die höchste Version ein Löschkennzeichen "X" hat,
 *   wird das Dokument komplett verworfen.
 * - Wenn kein DOKNR vorhanden ist, bleibt die Row erhalten.
 */
export function keepLatestCredosDocumentVersions(rows, options = {}) {
  const {
    documentNumberField = "DOKNR",
    documentVersionField = "DOKVR",
    deleteFlagField = "TZ_LOEKZ",
    deleteFlagValue = "X"
  } = options;

  const rowsWithoutDocumentNumber = [];
  const latestRowByDocumentNumber = new Map();

  for (const row of rows) {
    const documentNumber = normalizeValue(row[documentNumberField]);

    if (!documentNumber) {
      rowsWithoutDocumentNumber.push(row);
      continue;
    }

    const currentLatestRow = latestRowByDocumentNumber.get(documentNumber);

    if (!currentLatestRow) {
      latestRowByDocumentNumber.set(documentNumber, row);
      continue;
    }

    const currentVersion = parseVersion(row[documentVersionField]);
    const latestVersion = parseVersion(currentLatestRow[documentVersionField]);

    if (currentVersion > latestVersion) {
      latestRowByDocumentNumber.set(documentNumber, row);
    }
  }

  const latestRows = [...latestRowByDocumentNumber.values()].filter(row => {
    const deleteFlag = normalizeValue(row[deleteFlagField]);

    return deleteFlag !== deleteFlagValue;
  });

  return [
    ...rowsWithoutDocumentNumber,
    ...latestRows
  ];
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}

function parseVersion(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const version = Number(String(value).trim());

  if (Number.isNaN(version)) {
    return 0;
  }

  return version;
}