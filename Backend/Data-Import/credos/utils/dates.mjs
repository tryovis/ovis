/** SAP empty dates and incomplete calendar dates are unknown, never events. */
export function toCredosIsoDateOrNull(value, { fieldName = 'unknown', strict = true } = {}) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || ['00000000', '0000-00-00', '00.00.0000'].includes(text)) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/.exec(text);
  const german = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  const parts = iso ? iso.slice(1, 4) : german ? [german[3], german[2], german[1]] : compact?.slice(1);
  if (parts) {
    const [year, month, day] = parts.map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      if (!iso?.[4]) return `${parts.join('-')}T00:00:00Z`;
      if (Number.isFinite(Date.parse(text))) return text;
    }
  }
  if (!strict) return null;
  throw new Error(`Ungültiges CREDOS-Datum in Feld "${fieldName}"`);
}
export const toOptionalCredosIsoDateOrNull = (value, fieldName = 'unknown') =>
  toCredosIsoDateOrNull(value, { fieldName, strict: false });
export const toRequiredCredosIsoDateOrNull = (value, fieldName = 'unknown') =>
  toCredosIsoDateOrNull(value, { fieldName, strict: true });
