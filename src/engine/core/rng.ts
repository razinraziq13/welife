/**
 * Seeded pseudo-random number generation (spec §4: all randomness is seeded and reproducible).
 *
 * - `sfc32` generator (32-bit integer arithmetic only: identical results in every JS engine).
 * - Seeds are derived from strings with `cyrb128`.
 * - The world keeps one independent stream per subsystem, so adding (say) an NPC event does
 *   not shift the random sequence used by mortality or genetics.
 */

export type RngTuple = [number, number, number, number];

/** 128-bit string hash -> four unsigned 32-bit integers. */
export function seedFromString(text: string): RngTuple {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

const TWO_POW_32 = 0x100000000;

export class Rng {
  #a: number;
  #b: number;
  #c: number;
  #d: number;

  constructor(state: readonly [number, number, number, number]) {
    this.#a = state[0] >>> 0;
    this.#b = state[1] >>> 0;
    this.#c = state[2] >>> 0;
    this.#d = state[3] >>> 0;
  }

  /** A generator seeded from text, warmed up to decorrelate similar seeds. */
  static fromSeed(seed: string): Rng {
    const rng = new Rng(seedFromString(seed));
    for (let i = 0; i < 16; i++) rng.nextUint32();
    return rng;
  }

  state(): RngTuple {
    return [this.#a, this.#b, this.#c, this.#d];
  }

  nextUint32(): number {
    const t = (((this.#a + this.#b) >>> 0) + this.#d) >>> 0;
    this.#d = (this.#d + 1) >>> 0;
    this.#a = (this.#b ^ (this.#b >>> 9)) >>> 0;
    this.#b = (this.#c + (this.#c << 3)) >>> 0;
    this.#c = ((this.#c << 21) | (this.#c >>> 11)) >>> 0;
    this.#c = (this.#c + t) >>> 0;
    return t;
  }

  /** Uniform integer in [0, maxExclusive) without modulo bias. */
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > TWO_POW_32) {
      throw new RangeError(`Rng.int: invalid bound ${String(maxExclusive)}`);
    }
    const limit = Math.floor(TWO_POW_32 / maxExclusive) * maxExclusive;
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return x % maxExclusive;
  }

  /** Uniform integer in [min, max] (inclusive). */
  range(min: number, max: number): number {
    if (max < min) throw new RangeError('Rng.range: max < min');
    return min + this.int(max - min + 1);
  }

  /** True with probability ppm / 1,000,000 (parts per million). */
  chancePpm(ppm: number): boolean {
    if (ppm <= 0) return false;
    if (ppm >= 1_000_000) return true;
    return this.int(1_000_000) < ppm;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: empty list');
    return items[this.int(items.length)] as T;
  }

  /** Weighted choice; weights are non-negative integers. */
  weighted<T>(entries: readonly { value: T; weight: number }[]): T {
    let total = 0;
    for (const entry of entries) total += Math.max(0, Math.floor(entry.weight));
    if (total <= 0) throw new RangeError('Rng.weighted: no positive weights');
    let roll = this.int(total);
    for (const entry of entries) {
      const weight = Math.max(0, Math.floor(entry.weight));
      if (roll < weight) return entry.value;
      roll -= weight;
    }
    throw new Error('Rng.weighted: unreachable');
  }

  /** Deterministic Fisher-Yates shuffle (returns a new array). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}
