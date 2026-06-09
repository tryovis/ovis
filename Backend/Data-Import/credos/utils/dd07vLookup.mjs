// utils/dd07vLookup.mjs
import fs from "node:fs/promises";

/**
 * Baut einen Lookup für SAP/DD07V-artige Wertehilfen.
 *
 * Erwartetes Format in dd07v.txt:
 *
 * ZN2_TZES_D_GRA$0002$D$G1$$Grad I - Gut differenziert$$$
 *
 * Relevante Spalten nach Split mit "$":
 * [0] Domain / Feldname, z.B. ZN2_TZES_D_GRA
 * [3] Kürzel / Code, z.B. G1
 * [5] Langtext, z.B. Grad I - Gut differenziert
 */
export async function createDd07vLookup(filePath, options = {}) {
  const {
    delimiter = "$",
    encoding = "utf8"
  } = options;

  const content = await fs.readFile(filePath, encoding);

  const lines = content
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== "");

  const valueByDomainAndCode = new Map();

  for (const line of lines) {
    const columns = line.split(delimiter);

    const domain = normalizeKey(columns[0]);
    const code = normalizeKey(columns[3]);
    const text = normalizeText(columns[5]);

    if (!domain || !code || !text) {
      continue;
    }

    const lookupKey = createLookupKey(domain, code);

    valueByDomainAndCode.set(lookupKey, text);
  }

  return {
    resolve(domainNames, code, options = {}) {
      const {
        fallbackToCode = true
      } = options;

      if (code === null || code === undefined || code === "") {
        return null;
      }

      const normalizedCode = normalizeKey(code);

      if (!normalizedCode) {
        return null;
      }

      const domains = Array.isArray(domainNames)
        ? domainNames
        : [domainNames];

      for (const domain of domains) {
        const normalizedDomain = normalizeKey(domain);

        if (!normalizedDomain) {
          continue;
        }

        const lookupKey = createLookupKey(normalizedDomain, normalizedCode);

        if (valueByDomainAndCode.has(lookupKey)) {
          return valueByDomainAndCode.get(lookupKey);
        }
      }

      return fallbackToCode ? String(code).trim() : null;
    },

    has(domainNames, code) {
      if (code === null || code === undefined || code === "") {
        return false;
      }

      const normalizedCode = normalizeKey(code);

      if (!normalizedCode) {
        return false;
      }

      const domains = Array.isArray(domainNames)
        ? domainNames
        : [domainNames];

      return domains.some(domain => {
        const normalizedDomain = normalizeKey(domain);

        if (!normalizedDomain) {
          return false;
        }

        return valueByDomainAndCode.has(
          createLookupKey(normalizedDomain, normalizedCode)
        );
      });
    }
  };
}

function createLookupKey(domain, code) {
  return `${normalizeKey(domain)}::${normalizeKey(code)}`;
}

function normalizeKey(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed.toUpperCase();
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}