import { z } from 'zod';
import { dutyKind } from '../civics/royal';
import { seedFromString } from '../core/rng';
import { ageYears } from '../core/world';
import { totalFollowers } from '../media/media';
import { WEALTH_TIERS, type Character, type World } from '../state/schema';

export const DatingPreferencesSchema = z
  .strictObject({
    minAge: z.number().int().min(18).max(130).optional(),
    maxAge: z.number().int().min(18).max(130).optional(),
    minWealth: z.enum(WEALTH_TIERS).optional(),
    minLooks: z.number().int().min(1).max(100).optional(),
    status: z.enum(['celebrity', 'royalty']).optional(),
  })
  .refine(({ minAge, maxAge }) => minAge === undefined || maxAge === undefined || minAge <= maxAge);

export type DatingPreferences = z.infer<typeof DatingPreferencesSchema>;

export function datingProfileTraits(world: World, person: Character) {
  return {
    wealth: world.households[person.householdId]?.wealth ?? null,
    // A fictional character rating, stable across reloads and independent of avatars or RNG streams.
    looks: 1 + (seedFromString(`${world.seed}:dating-looks:${person.id}`)[0] % 100),
    celebrity: totalFollowers(world, person.id) >= 100_000,
    royalty: dutyKind(world, person) === 'royal',
  };
}

export function fitsDatingPreferences(
  age: number,
  traits: ReturnType<typeof datingProfileTraits>,
  preferences: DatingPreferences,
): boolean {
  const { minAge, maxAge, minWealth, minLooks, status } = preferences;
  return (
    (minAge === undefined || age >= minAge) &&
    (maxAge === undefined || age <= maxAge) &&
    (minWealth === undefined ||
      (traits.wealth !== null &&
        WEALTH_TIERS.indexOf(traits.wealth) >= WEALTH_TIERS.indexOf(minWealth))) &&
    (minLooks === undefined || traits.looks >= minLooks) &&
    (status === undefined || traits[status])
  );
}

export function matchesDatingPreferences(
  world: World,
  person: Character,
  preferences: DatingPreferences,
): boolean {
  return fitsDatingPreferences(
    ageYears(world, person),
    datingProfileTraits(world, person),
    preferences,
  );
}
