import path from 'node:path';
import { parseCredosDollarFile } from '../credosDollarParser.mjs';
import { value } from './rows.mjs';

export async function readOptionalExport(directory, name) {
  try { return await parseCredosDollarFile(path.join(directory, `${name}.txt`)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

const tableKey = name => String(name ?? '').replace(/^ZN2_/i, '').toLowerCase();

/** SAP metadata supplies labels/domains. Missing metadata never drops a raw value. */
export async function createSchemaLookup(directory, dd07vLookup) {
  const fields = new Map();
  for (const file of ['dd03l', 'dfies_tab_all']) {
    for (const row of await readOptionalExport(directory, file)) {
      const field = value(row, 'FIELDNAME');
      if (!field) continue;
      const key = `${tableKey(value(row, 'TABNAME'))}.${field.toUpperCase()}`;
      const previous = fields.get(key) ?? {};
      fields.set(key, {
        label: value(row, 'FIELDTEXT', 'SCRTEXT_L', 'REPTEXT') ?? previous.label,
        domain: value(row, 'DOMNAME', 'ROLLNAME') ?? previous.domain,
        datatype: value(row, 'DATATYPE') ?? previous.datatype
      });
    }
  }
  const catalogs = new Map();
  for (const file of ['zn2crcondclasses', 'zn2crcondstages', 'zn2tumorclasses', 'zn2tumorstages']) {
    for (const row of await readOptionalExport(directory, file)) {
      const category = value(row, 'ZN2CLASS');
      const stage = value(row, 'ZN2STAGE');
      const label = stage === null ? value(row, 'ZN2CLASSTXT') : value(row, 'ZN2STAGETXT');
      if (!category || !label) continue;
      const key = `${category}\u0000${stage ?? ''}`;
      const old = catalogs.get(key);
      if (!old) catalogs.set(key, label);
      else if (old !== label && !old.split('\n').includes(label)) catalogs.set(key, `${old}\n${label}`);
    }
  }
  return {
    field(table, field) { return fields.get(`${tableKey(table)}.${field.toUpperCase()}`) ?? {}; },
    resolve(table, field, raw) {
      if (raw === null || raw === undefined || raw === '') return null;
      const { domain } = this.field(table, field);
      return dd07vLookup?.resolve([domain, `ZN2_${field}`, field].filter(Boolean), raw) ?? String(raw);
    },
    category(category) { return catalogs.get(`${category}\u0000`) ?? category; },
    stage(category, raw) { return catalogs.get(`${category}\u0000${raw}`) ?? raw; }
  };
}
