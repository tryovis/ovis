/** OVis grading aggregation compares the canonical numeric grades. */
export function mapCredosGrading(raw, dd07vLookup) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const code = String(raw).trim();
  const grade = /^G?([0-4])$/i.exec(code);
  if (grade) return grade[1];
  if (/^GX$/i.test(code)) return 'Differenzierungsgrad nicht bestimmbar';
  return dd07vLookup?.resolve(['ZN2_TZES_D_GRA', 'ZN2_TZ_D_GRA'], code) ?? code;
}
