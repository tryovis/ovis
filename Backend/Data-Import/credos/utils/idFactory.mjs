// utils/idFactory.mjs

/**
 * Erzeugt stabile numerische IDs für Werte, die eigentlich numerisch sein sollen,
 * in Testdaten aber manchmal als Hash/String vorliegen.
 *
 * Verhalten:
 * - "3456" bleibt 3456
 * - 3456 bleibt 3456
 * - "60282e956da0..." wird z.B. 1
 * - derselbe Hash bekommt immer dieselbe Nummer
 */
export function createStableNumericIdFactory(options = {}) {
  const { startAt = 1 } = options;

  const idByRawValue = new Map();
  let nextId = startAt;

  return function getStableNumericId(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      return null;
    }

    const key = String(rawValue).trim();

    if (key === "") {
      return null;
    }

    /**
     * Wenn der Wert bereits eine Ganzzahl ist, übernehmen wir ihn unverändert.
     * Das ist wichtig fürs Livesystem.
     */
    if (/^\d+$/.test(key)) {
      return Number(key);
    }

    /**
     * Nur nicht-numerische Werte bekommen eine synthetische Nummer.
     */
    if (!idByRawValue.has(key)) {
      idByRawValue.set(key, nextId);
      nextId += 1;
    }

    return idByRawValue.get(key);
  };
}