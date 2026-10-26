import { toOptionalCredosIsoDateOrNull as date } from '../utils/dates.mjs';
import { value, provenance } from '../utils/rows.mjs';
import { mapCredosGrading } from '../utils/grading.mjs';

export function mapHistologies(row, { source, tumorID, patID, dd07vLookup }) {
  const first = source === 'tzes' || source === 'tzey';
  const definitions = first
    ? [{ code: ['TZE_D_HIS2'], text: ['TZE_DHIST2', 'TZE_D_HIST2'] }]
    : source === 'tzpbdiag'
      ? [{ code: ['TZPB_D_HIS'], text: ['TZPB_D_HIST'], grade: ['TZPB_D_GRA'] }]
      : [{ code: ['TZV_D_HIS', 'TZ_D_HIS'], text: ['TZV_D_HIST', 'TZ_D_HIST'], grade: ['TZVS_D_GRA', 'TZ_D_GRA'] },
         { code: ['TZ_D_HIS2'], text: ['TZ_D_HIST2'] }];
  return definitions.flatMap(spec => {
    const code = value(row, spec.code);
    const text = value(row, spec.text);
    const grade = value(row, spec.grade ?? []);
    if (!code && !text && !grade) return [];
    return [{ tumorID, patID, ICDO_histologyCode: code, ICDO_histologyCodeText: text,
      ICDO_grading: mapCredosGrading(grade, dd07vLookup),
      ICDO_histologyDate: date(value(row, 'TZ_D_HISDA', 'TZPB_UDATUM')),
      ICDO_Nu: value(row, 'TZTH_K_ANU', 'TZTH_K_NU', 'TZPB_K_ANU'),
      ICDO_Nb: value(row, 'TZTH_K_ANB', 'TZTH_K_NB', 'TZPB_K_ANB'),
      ...provenance(row, source, spec.code[0]) }];
  });
}
