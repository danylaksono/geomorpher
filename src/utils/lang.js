/**
 * Minimal internal replacements for the handful of lodash helpers this library
 * used. Keeping them local avoids shipping ~3 MB of lodash to consumers.
 * @module utils/lang
 */

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Recursive clone of plain objects and arrays. Non-plain values (functions,
 * class instances, typed arrays) are passed through by reference, which is the
 * behaviour this library relies on for GeoJSON payloads.
 */
function cloneRecursive(value) {
  if (Array.isArray(value)) {
    return value.map(cloneRecursive);
  }

  if (isPlainObject(value)) {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = cloneRecursive(entry);
    }
    return output;
  }

  return value;
}

/**
 * Deep clone a value. Uses the native `structuredClone` when it can handle the
 * input (fast path for large GeoJSON), falling back to a recursive copy for
 * values it rejects, such as objects carrying functions.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneDeep(value) {
  if (value === null || typeof value !== "object") return value;

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall through: the value holds something structuredClone cannot copy.
    }
  }

  return cloneRecursive(value);
}

/**
 * Build an object keyed by the given property of each item.
 *
 * @template T
 * @param {T[]} collection
 * @param {string} key
 * @returns {Record<string, T>}
 */
export function keyBy(collection, key) {
  const output = {};
  if (!Array.isArray(collection)) return output;

  for (const item of collection) {
    const identifier = item?.[key];
    if (identifier === null || identifier === undefined) continue;
    output[identifier] = item;
  }

  return output;
}

/**
 * Map an object's values, preserving its keys.
 *
 * @template T, R
 * @param {Record<string, T>} object
 * @param {(value: T, key: string) => R} iteratee
 * @returns {Record<string, R>}
 */
export function mapValues(object, iteratee) {
  const output = {};
  if (!isPlainObject(object)) return output;

  for (const [key, value] of Object.entries(object)) {
    output[key] = iteratee(value, key);
  }

  return output;
}

/**
 * True for null/undefined, empty arrays or strings, empty Map/Set, and objects
 * with no own enumerable keys. Matches the lodash semantics this library used.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) || typeof value === "string") return value.length === 0;
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return true;
}
