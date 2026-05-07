// utils/dates.mjs

/**
 * Formatiert CREDOS-Datumswerte in das gewünschte omock-Format:
 *
 * YYYY-MM-DDT00:00:00Z
 *
 * Unterstützte Eingaben:
 * - 1921-01-24
 * - 24.01.1921
 * - 19210124
 * - 1921-01-24T00:00:00Z
 *
 * Optionen:
 * - strict: true  => wirft Fehler bei unbekanntem Format
 * - strict: false => gibt null zurück bei unbekanntem Format
 */
export function toCredosIsoDateOrNull(value, options = {}) {
  const {
    fieldName = "unknown",
    strict = true
  } = options;

  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  if (trimmed === "") {
    return null;
  }

  // Bereits volles ISO-Datum mit Zeit
  // Beispiel: 1921-01-24T00:00:00Z
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed;
  }

  // ISO ohne Zeit
  // Beispiel: 1921-01-24
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00Z`;
  }

  // Deutsches Format
  // Beispiel: 24.01.1921
  const germanDate = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (germanDate) {
    const [, day, month, year] = germanDate;
    return `${year}-${month}-${day}T00:00:00Z`;
  }

  // Kompaktes Format
  // Beispiel: 19210124
  const compactDate = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) {
    const [, year, month, day] = compactDate;
    return `${year}-${month}-${day}T00:00:00Z`;
  }

  if (!strict) {
    return null;
  }

  throw new Error(
    `Unbekanntes Datumsformat in Feld "${fieldName}": "${value}"`
  );
}

/**
 * Convenience-Funktion für fachlich optionale Datumsfelder.
 * Ungültige Werte werden zu null.
 */
export function toOptionalCredosIsoDateOrNull(value, fieldName = "unknown") {
  return toCredosIsoDateOrNull(value, {
    fieldName,
    strict: false
  });
}

/**
 * Convenience-Funktion für fachlich wichtige Datumsfelder.
 * Ungültige Werte werfen einen Fehler.
 */
export function toRequiredCredosIsoDateOrNull(value, fieldName = "unknown") {
  return toCredosIsoDateOrNull(value, {
    fieldName,
    strict: true
  });
}