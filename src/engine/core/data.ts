/**
 * Helpers for the plain, JSON-like data the world is made of
 * (objects, arrays, strings, finite numbers, booleans, null, bigint).
 */

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep copy of plain data (no shared references with the source). */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item: unknown) => deepClone(item)) as T;
  const out: PlainObject = {};
  for (const key of Object.keys(value)) out[key] = deepClone((value as PlainObject)[key]);
  return out as T;
}

/**
 * Canonical JSON: object keys sorted, `undefined` properties omitted, bigint encoded as
 * `{"$bigint":"123"}`. Equal data always produces the identical string, which makes it
 * suitable for hashing and deterministic storage.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'bigint':
      return `{"$bigint":${JSON.stringify(value.toString())}}`;
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item: unknown) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
      }
      const record = value as PlainObject;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

/** Parses canonical JSON, restoring `{"$bigint": "..."}` values to bigint. */
export function parseCanonicalJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown) => {
    if (
      isPlainObject(value) &&
      typeof value.$bigint === 'string' &&
      Object.keys(value).length === 1
    ) {
      return BigInt(value.$bigint);
    }
    return value;
  });
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return canonicalJson(a) === canonicalJson(b);
}

/** Keys of a record in a stable (sorted) order; use for every iteration that affects results. */
export function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

/** Values of a record ordered by key. */
export function sortedValues<T>(record: Record<string, T>): T[] {
  return Object.keys(record)
    .sort()
    .map((key) => record[key] as T);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Integer division rounded toward negative infinity (deterministic for negatives too). */
export function idiv(numerator: number, denominator: number): number {
  return Math.floor(numerator / denominator);
}
