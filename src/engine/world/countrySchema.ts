import { z } from 'zod';

/**
 * Country profile (spec §4 World/countries, §6 CountryProfile).
 * Milestone 2 authors the baseline fields; institutional depth (tax bands, immigration,
 * inheritance, politics, military) is researched and added in Milestone 6.
 */

export const LocationSchema = z
  .object({
    id: z.string().min(3).max(40),
    name: z.string().min(1).max(60),
    region: z.string().min(1).max(60),
    kind: z.enum(['city', 'rural']),
    /** Living-cost index relative to the national average (100). */
    costIndex: z.number().int().min(40).max(250),
  })
  .strict();
export type Location = z.infer<typeof LocationSchema>;

const NameListSchema = z.array(z.string().min(1).max(40)).min(4);

export const CountryProfileSchema = z
  .object({
    code: z.string().length(2),
    name: z.string().min(2).max(60),
    demonym: z.string().min(2).max(40),
    currency: z
      .object({
        code: z.string().length(3),
        /** ISO 4217 minor-unit exponent (e.g. 2 for cents, 0 for yen). */
        exponent: z.number().int().min(0).max(3),
        symbol: z.string().min(1).max(6),
      })
      .strict(),
    locations: z.array(LocationSchema).min(3),
    economy: z
      .object({
        /** Approximate median gross monthly wage, in currency minor units. */
        medianMonthlyWageMinor: z.number().int().positive(),
        /** Approximate national cost of living relative to the United States (100). */
        costOfLivingIndex: z.number().int().min(10).max(200),
      })
      .strict(),
    /** Period life expectancy at birth, whole years. */
    lifeExpectancy: z.number().int().min(45).max(95),
    monarchy: z
      .object({
        system: z.enum(['none', 'constitutional', 'absolute', 'federal-elective', 'traditional']),
        /** Whether a player can realistically be born into a royal family here (decisions D4/D5). */
        royalBirthAvailable: z.boolean(),
        royalNote: z.string().max(240),
        nobilityAvailable: z.boolean(),
        nobilityNote: z.string().max(240),
        /** Courtesy/hereditary titles by scenario and gender (null = none used). */
        royalTitle: z.object({ female: z.string(), male: z.string() }).strict().nullable(),
        nobleTitle: z.object({ female: z.string(), male: z.string() }).strict().nullable(),
        /** Surname particle used by noble families (e.g. "von"). */
        nobleParticle: z.string().max(10).nullable(),
      })
      .strict(),
    names: z
      .object({
        order: z.enum(['given-first', 'family-first']),
        female: NameListSchema,
        male: NameListSchema,
        family: NameListSchema,
      })
      .strict(),
    source: z
      .object({
        asOf: z.string().max(20),
        status: z.enum(['baseline-unverified', 'researched']),
        references: z.array(z.string().max(200)).min(1),
      })
      .strict(),
  })
  .strict();
export type CountryProfile = z.infer<typeof CountryProfileSchema>;
