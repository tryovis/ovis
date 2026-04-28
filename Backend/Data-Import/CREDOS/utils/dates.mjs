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
 */
export function toCredosIsoDateOrNull(value) {
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

  throw new Error(`Unbekanntes Datumsformat: "${value}"`);
}