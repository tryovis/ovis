import { env } from '$env/dynamic/public';

type LabelValue = {
  label: string;
  value: string;
  bindId?: string;
};

export type QueryConfig = {
  id: string;
  key: string;
  system: string;
  type: 'EQUALS' | 'NEQUALS';
  label: string;
  value: string;
  bindId: string;
};

export type CertificationCase = {
  id: string;
  translationKey: string;
  layoutClass: string;
  positive: QueryConfig;
  negative: QueryConfig;
};

const delimiters = new Set([';', ',']);

const trim = (value: string | undefined | null) => (value ?? '').toString().trim();

const splitWithEscapes = (value: string | undefined) => {
  if (!value) return [];
  const chars = Array.from(value);
  const entries: string[] = [];
  let buffer = '';
  let escaped = false;

  for (const ch of chars) {
    if (escaped) {
      buffer += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (delimiters.has(ch)) {
      const entry = trim(buffer);
      if (entry && entry.toLowerCase() !== 'null') entries.push(entry);
      buffer = '';
      continue;
    }
    buffer += ch;
  }

  const finalEntry = trim(buffer);
  if (finalEntry && finalEntry.toLowerCase() !== 'null') entries.push(finalEntry);

  return entries;
};

const parseLabelValueEntry = (entry: string, fallback: LabelValue): LabelValue => {
  const segments = entry.split('|').map(part => trim(part));
  const [label, value, bindId] = segments;
  return {
    label: label || fallback.label,
    value: value || fallback.value,
    bindId: bindId || fallback.bindId
  };
};

const parseLabelValueList = (raw: string | undefined, fallback: LabelValue[]): LabelValue[] => {
  const defaults = fallback.map(item => ({ ...item }));
  if (!raw) return defaults;

  const entries = splitWithEscapes(raw);
  if (!entries.length) return defaults;

  return entries.map((entry, index) => {
    const fallbackItem = defaults[index] ?? defaults[defaults.length - 1] ?? { label: '', value: '' };
    return parseLabelValueEntry(entry, fallbackItem);
  });
};

const parseKeyedLabelValues = (raw: string | undefined, fallback: Record<string, LabelValue>) => {
  const result: Record<string, LabelValue> = Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => [key, { ...value }])
  );
  if (!raw) return result;

  const assignments = splitWithEscapes(raw);
  if (!assignments.length) return result;

  for (const assignment of assignments) {
    const [rawKey, rawValue] = assignment.split('=');
    const key = trim(rawKey);
    if (!key || !rawValue) continue;
    if (!(key in result)) continue;
    result[key] = parseLabelValueEntry(rawValue, result[key]);
  }
  return result;
};

const parseStringList = (raw: string | undefined, fallback: string[]): string[] => {
  if (!raw) return [...fallback];
  const entries = splitWithEscapes(raw).filter(Boolean);
  return entries.length ? entries : [...fallback];
};

const defaultGenderButtons: LabelValue[] = [
  { label: 'M', value: 'm' },
  { label: 'W', value: 'w' },
  { label: 'Other', value: 'other' }
];

const defaultGenderOtherExclusions = ['m', 'w'];

const defaultCertCasesPos: Record<string, LabelValue> = {
  primary: { label: 'Primary Case', value: 'Ja', bindId: 'primary-case-bind' },
  recurrence: { label: 'Recurrence Case', value: 'true', bindId: 'recurrence-case-bind' },
  center: { label: 'Center Case', value: 'Ja', bindId: 'center-case-bind' }
};

const defaultCertCasesNeg: Record<string, LabelValue> = {
  primary: { label: 'Primary Case', value: 'Nein', bindId: 'primary-case-bind-no' },
  recurrence: { label: 'Recurrence Case', value: 'false', bindId: 'recurrence-case-bind-no' },
  center: { label: 'Center Case', value: 'Nein', bindId: 'center-case-bind-no' }
};

const defaultInternalLabel: LabelValue = {
  label: 'Meine Einrichtung',
  value: 'Meine Einrichtung',
  bindId: 'internal-case-bind'
};

export const genderButtons = parseLabelValueList(
  env.PUBLIC_QUICKTOOLS_GENDER_BUTTONS,
  defaultGenderButtons
);

export const genderOtherExclusions = parseStringList(
  env.PUBLIC_QUICKTOOLS_GENDER_OTHER_EXCLUSIONS,
  defaultGenderOtherExclusions
);

const certCasesPos = parseKeyedLabelValues(
  env.PUBLIC_QUICKTOOLS_CERT_CASES_POS,
  defaultCertCasesPos
);

const certCasesNeg = parseKeyedLabelValues(
  env.PUBLIC_QUICKTOOLS_CERT_CASES_NEG,
  defaultCertCasesNeg
);

const internalLabel = parseLabelValueEntry(
  env.PUBLIC_QUICKTOOLS_CERT_INTERNAL_LABEL ?? '',
  defaultInternalLabel
);

const ensureBindId = (value: LabelValue, fallback: string) => value.bindId || fallback;

const certificationCaseOrder: Array<{ id: 'primary' | 'recurrence' | 'center'; translationKey: string; layoutClass: string; key: string }> = [
  { id: 'primary', translationKey: 'primaryCase', layoutClass: 'primaer', key: 'primaryCase' },
  { id: 'recurrence', translationKey: 'recurrence', layoutClass: 'rezidiv', key: 'recurrence' },
  { id: 'center', translationKey: 'centerCase', layoutClass: 'zentrum', key: 'centerCase' }
];

export const certificationCases: CertificationCase[] = [
  ...certificationCaseOrder.map(({ id, translationKey, layoutClass, key }) => ({
    id,
    translationKey,
    layoutClass,
    positive: {
      id: `${id}-case`,
      key,
      system: 'diagnosis',
      type: 'EQUALS' as const,
      label: certCasesPos[id].label,
      value: certCasesPos[id].value,
      bindId: ensureBindId(certCasesPos[id], `${id}-case-bind`)
    },
    negative: {
      id: `${id}-case`,
      key,
      system: 'diagnosis',
      type: 'EQUALS' as const,
      label: certCasesNeg[id].label,
      value: certCasesNeg[id].value,
      bindId: ensureBindId(certCasesNeg[id], `${id}-case-bind-no`)
    }
  })),
  {
    id: 'internal',
    translationKey: 'internalCase',
    layoutClass: 'intern',
    positive: {
      id: 'internal',
      key: 'internal',
      system: 'diagnosis',
      type: 'EQUALS',
      label: internalLabel.label,
      value: internalLabel.value,
      bindId: ensureBindId(internalLabel, 'internal-case-bind')
    },
    negative: {
      id: 'internal-case',
      key: '!internal',
      system: 'diagnosis',
      type: 'NEQUALS',
      label: internalLabel.label,
      value: internalLabel.value,
      bindId: `${ensureBindId(internalLabel, 'internal-case-bind')}-no`
    }
  }
];
