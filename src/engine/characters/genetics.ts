import type { Rng } from '../core/rng';
import { clamp } from '../core/data';
import {
  APPEARANCE_LIMITS,
  TRAIT_KEYS,
  type Appearance,
  type Gender,
  type Traits,
} from '../state/schema';

/**
 * Appearance and personality generation. Appearance is cosmetic only and never affects
 * stats or outcomes (spec §4: "Optional cosmetic appearance does not determine personal worth").
 */

/**
 * Hairstyles people are usually given at birth, by gender (styles: 0 short crop, 1 side part,
 * 2 short curls, 3 long straight, 4 bob, 5 ponytail, 6 volume, 7 buzz). Anyone can change their
 * hair later at a barber or salon; this only sets a typical starting style.
 */
export const HAIR_STYLES_BY_GENDER: Record<Gender, readonly number[]> = {
  male: [0, 1, 2, 6, 7],
  female: [3, 4, 5, 2, 6, 1],
  nonbinary: [0, 1, 2, 3, 4, 5, 6, 7],
};

export function hairStyleFor(rng: Rng, gender: Gender): number {
  const options = HAIR_STYLES_BY_GENDER[gender];
  return options[rng.int(options.length)] ?? 0;
}

export function randomAppearance(rng: Rng, gender: Gender): Appearance {
  return {
    skinTone: rng.int(APPEARANCE_LIMITS.skinTone),
    hairColor: rng.int(APPEARANCE_LIMITS.hairColor),
    hairStyle: hairStyleFor(rng, gender),
    eyeColor: rng.int(APPEARANCE_LIMITS.eyeColor),
    faceShape: rng.int(APPEARANCE_LIMITS.faceShape),
    freckles: rng.int(10) === 0,
  };
}

/** A child's appearance blended from biological parents, with small random variation. */
export function inheritAppearance(
  rng: Rng,
  parents: readonly Appearance[],
  gender: Gender,
): Appearance {
  const [a, b] = parents;
  if (!a) return randomAppearance(rng, gender);
  const other = b ?? a;
  const blendTone = Math.floor((a.skinTone + other.skinTone + 1) / 2) + rng.range(-1, 1);
  const fromParent = <K extends keyof Appearance>(key: K): Appearance[K] =>
    rng.int(2) === 0 ? a[key] : other[key];
  return {
    skinTone: clamp(blendTone, 0, APPEARANCE_LIMITS.skinTone - 1),
    hairColor: rng.int(10) < 8 ? fromParent('hairColor') : rng.int(APPEARANCE_LIMITS.hairColor),
    hairStyle: hairStyleFor(rng, gender),
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
