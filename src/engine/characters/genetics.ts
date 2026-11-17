import type { Rng } from '../core/rng';
import { clamp } from '../core/data';
import { APPEARANCE_LIMITS, TRAIT_KEYS, type Appearance, type Traits } from '../state/schema';

/**
 * Appearance and personality generation. Appearance is cosmetic only and never affects
 * stats or outcomes (spec §4: "Optional cosmetic appearance does not determine personal worth").
 */

export function randomAppearance(rng: Rng): Appearance {
  return {
    skinTone: rng.int(APPEARANCE_LIMITS.skinTone),
    hairColor: rng.int(APPEARANCE_LIMITS.hairColor),
    hairStyle: rng.int(APPEARANCE_LIMITS.hairStyle),
    eyeColor: rng.int(APPEARANCE_LIMITS.eyeColor),
    faceShape: rng.int(APPEARANCE_LIMITS.faceShape),
    freckles: rng.int(10) === 0,
  };
}

/** A child's appearance blended from biological parents, with small random variation. */
export function inheritAppearance(rng: Rng, parents: readonly Appearance[]): Appearance {
  const [a, b] = parents;
  if (!a) return randomAppearance(rng);
  const other = b ?? a;
  const blendTone = Math.floor((a.skinTone + other.skinTone + 1) / 2) + rng.range(-1, 1);
  const fromParent = <K extends keyof Appearance>(key: K): Appearance[K] =>
    rng.int(2) === 0 ? a[key] : other[key];
  return {
    skinTone: clamp(blendTone, 0, APPEARANCE_LIMITS.skinTone - 1),
    hairColor: rng.int(10) < 8 ? fromParent('hairColor') : rng.int(APPEARANCE_LIMITS.hairColor),
    hairStyle: rng.int(APPEARANCE_LIMITS.hairStyle),
    eyeColor: rng.int(10) < 9 ? fromParent('eyeColor') : rng.int(APPEARANCE_LIMITS.eyeColor),
    faceShape: fromParent('faceShape'),
    freckles: a.freckles || other.freckles ? rng.int(2) === 0 : rng.int(10) === 0,
  };
}

export function randomTraits(rng: Rng): Traits {
  const traits = {} as Traits;
  for (const key of TRAIT_KEYS) traits[key] = rng.range(20, 80);
  return traits;
}

/** Personality tendencies partly inherited (average of parents) plus individual variation. */
export function inheritTraits(rng: Rng, parents: readonly Traits[]): Traits {
  if (parents.length === 0) return randomTraits(rng);
  const traits = {} as Traits;
  for (const key of TRAIT_KEYS) {
    let sum = 0;
    for (const parent of parents) sum += parent[key];
    const average = Math.floor(sum / parents.length);
    traits[key] = clamp(Math.floor((average + rng.range(20, 80)) / 2) + rng.range(-10, 10), 0, 100);
  }
  return traits;
}
