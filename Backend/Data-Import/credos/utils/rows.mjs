export function value(row, ...fields) {
  for (const field of fields.flat()) {
    const raw = row?.[field] ?? row?.[field.toLowerCase()];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') return String(raw).trim();
  }
  return null;
}

// Details belong to the selected document version. Older exports may omit it.
export function matchesDocumentVersion(detail, parent) {
  const a = value(detail, 'DOKVR');
  const b = value(parent, 'DOKVR');
  if (a === null || b === null) return true;
  return /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) === Number(b) : a === b;
}

export function provenance(row, source, sourceField = null) {
  return { source, sourceField, sourceDocument: value(row, 'DOKNR'),
    sourceVersion: value(row, 'DOKVR'), sourceSequence: value(row, 'MUSEQ') };
}
