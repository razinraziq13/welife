import { z } from 'zod';
import { getCountry } from './countries';

/**
 * Country institutions needed by Milestones 3-4: school structure, work rules, income tax,
 * social contributions, pensions, unemployment benefits, healthcare coverage and baseline
 * rates.
 *
 * Status: BASELINE, UNVERIFIED. Values are rounded approximations of rules in force around
 * 2024-2025 (single person, no dependants, simplified: regional taxes folded into the bands,
 * contribution caps ignored). They are labelled as approximate in the UI and are researched
 * with dated sources in Milestone 6 (traceability W-03). Everything after the game's start
 * date is simulated (decision D4).
 */

const Band = z.tuple([z.number().int().min(0), z.number().int().min(0).max(9000)]);

export const SchoolStageRuleSchema = z
  .object({
    stage: z.enum(['primary', 'lowerSecondary', 'upperSecondary']),
    years: z.number().int().min(1).max(8),
    name: z.string().min(2).max(80),
    /** National exam at the end of the stage, if any. */
    exam: z.string().max(80).nullable(),
  })
  .strict();

export const CountryRulesSchema = z
  .object({
    code: z.string().length(2),
    education: z
      .object({
        preschoolAge: z.number().int().min(2).max(6),
        primaryStartAge: z.number().int().min(4).max(8),
        stages: z.array(SchoolStageRuleSchema).length(3),
        /** Legal end of compulsory schooling (age). */
        compulsoryUntilAge: z.number().int().min(12).max(18),
        schoolYearStartMonth: z.number().int().min(1).max(12),
        /** Annual tertiary tuition, in percent of one median monthly wage. */
        tuitionPublicPercent: z.number().int().min(0).max(5000),
        tuitionPrivatePercent: z.number().int().min(0).max(5000),
        /** Private school fee per month, percent of the median monthly wage. */
        privateSchoolPercent: z.number().int().min(0).max(500),
        studentLoans: z.boolean(),
      })
      .strict(),
    work: z
      .object({
        /** Minimum age for part-time work (light work rules simplified). */
        minWorkAge: z.number().int().min(13).max(18),
        fullTimeHours: z.number().int().min(120).max(220),
        /** Minimum or typical lowest wage, percent of the median wage. */
        minimumWagePercent: z.number().int().min(10).max(90),
      })
      .strict(),
    tax: z
      .object({
        yearStartMonth: z.number().int().min(1).max(12),
        /** Annual income-tax bands [from (major units), rate bp], ascending. */
        bands: z.array(Band).min(1).max(12),
        /** Annual allowance deducted before the bands apply (major units). */
        allowance: z.number().int().min(0),
        /** No income tax at or below this annual income (rebates), major units. */
        taxFreeBelow: z.number().int().min(0),
        /** Employee social contributions [from (major units), rate bp]. */
        socialBands: z.array(Band).min(1).max(6),
      })
      .strict(),
    pension: z
      .object({
        /** "account": contributions build a personal retirement account; "state": earnings-related state pension. */
        kind: z.enum(['account', 'state']),
        employeeBp: z.number().int().min(0).max(3000),
        employerBp: z.number().int().min(0).max(3000),
        /** Employer match for voluntary contributions (e.g. US 401(k)), bp of salary. */
        employerMatchBp: z.number().int().min(0).max(1000),
        stateAge: z.number().int().min(50).max(75),
        /** Flat or basic state pension, percent of the median monthly wage. */
        basicPercent: z.number().int().min(0).max(100),
        /** Earnings-related state pension, bp of average pensionable earnings. */
        replacementBp: z.number().int().min(0).max(10_000),
      })
      .strict(),
    benefits: z
      .object({
        unemployment: z.enum(['wage', 'flat', 'none']),
        /** Percent of previous wage ("wage") or of the median wage ("flat"). */
        unemploymentPercent: z.number().int().min(0).max(100),
        unemploymentMonths: z.number().int().min(0).max(36),
      })
      .strict(),
    healthcare: z
      .object({
        system: z.enum(['universal', 'mixed', 'insurance']),
        /** Share of treatment costs covered publicly, percent. */
        publicCoverage: z.number().int().min(0).max(100),
        /** Full-time jobs usually include health insurance (e.g. the United States). */
        employerInsurance: z.boolean(),
      })
      .strict(),
    rates: z
      .object({
        savingsBp: z.number().int().min(0).max(3000),
        policyBp: z.number().int().min(0).max(3000),
        inflationBp: z.number().int().min(-500).max(3000),
        unemploymentBp: z.number().int().min(100).max(4000),
      })
      .strict(),
  })
  .strict();
export type CountryRules = z.infer<typeof CountryRulesSchema>;

type StageInput = [number, string, string | null];
interface RulesInput {
  code: string;
  edu: {
    pre: number;
    start: number;
    primary: StageInput;
    lower: StageInput;
    upper: StageInput;
    compulsory: number;
    yearStart: number;
    tuition: [number, number];
    privateSchool: number;
    loans: boolean;
  };
  work: [number, number, number];
  tax: {
    yearStart: number;
    bands: [number, number][];
    allowance?: number;
    taxFreeBelow?: number;
    social: [number, number][];
  };
  pension: {
    kind: 'account' | 'state';
    employee: number;
    employer: number;
    match?: number;
    age: number;
    basic: number;
    replacement: number;
  };
  benefits: ['wage' | 'flat' | 'none', number, number];
  health: ['universal' | 'mixed' | 'insurance', number, boolean?];
  rates: [number, number, number, number];
}

function rules(input: RulesInput): CountryRules {
  const stage = (
    s: 'primary' | 'lowerSecondary' | 'upperSecondary',
    [years, name, exam]: StageInput,
  ) => ({
    stage: s,
    years,
    name,
    exam,
  });
  return CountryRulesSchema.parse({
    code: input.code,
    education: {
      preschoolAge: input.edu.pre,
      primaryStartAge: input.edu.start,
      stages: [
        stage('primary', input.edu.primary),
        stage('lowerSecondary', input.edu.lower),
        stage('upperSecondary', input.edu.upper),
      ],
      compulsoryUntilAge: input.edu.compulsory,
      schoolYearStartMonth: input.edu.yearStart,
      tuitionPublicPercent: input.edu.tuition[0],
      tuitionPrivatePercent: input.edu.tuition[1],
      privateSchoolPercent: input.edu.privateSchool,
      studentLoans: input.edu.loans,
    },
    work: {
      minWorkAge: input.work[0],
      fullTimeHours: input.work[1],
      minimumWagePercent: input.work[2],
    },
    tax: {
      yearStartMonth: input.tax.yearStart,
      bands: input.tax.bands,
      allowance: input.tax.allowance ?? 0,
      taxFreeBelow: input.tax.taxFreeBelow ?? 0,
      socialBands: input.tax.social,
    },
    pension: {
      kind: input.pension.kind,
      employeeBp: input.pension.employee,
      employerBp: input.pension.employer,
      employerMatchBp: input.pension.match ?? 0,
      stateAge: input.pension.age,
      basicPercent: input.pension.basic,
      replacementBp: input.pension.replacement,
    },
    benefits: {
      unemployment: input.benefits[0],
      unemploymentPercent: input.benefits[1],
      unemploymentMonths: input.benefits[2],
    },
    healthcare: {
      system: input.health[0],
      publicCoverage: input.health[1],
      employerInsurance: input.health[2] ?? false,
    },
    rates: {
      savingsBp: input.rates[0],
      policyBp: input.rates[1],
      inflationBp: input.rates[2],
      unemploymentBp: input.rates[3],
    },
  });
}

export const RULES_SOURCE = {
  asOf: '2024-2025',
  status: 'baseline-unverified' as const,
  note: 'Rounded approximations of national rules (single earner, regional taxes folded in, caps ignored).',
};

export const COUNTRY_RULES: readonly CountryRules[] = [
  rules({
    code: 'MY',
    edu: {
      pre: 4,
      start: 7,
      primary: [6, 'Primary school (Standard 1-6)', null],
      lower: [3, 'Lower secondary (Form 1-3)', null],
      upper: [2, 'Upper secondary (Form 4-5)', 'SPM'],
      compulsory: 12,
      yearStart: 1,
      tuition: [115, 1100],
      privateSchool: 55,
      loans: true,
    },
    work: [15, 190, 65],
    tax: {
      yearStart: 1,
      allowance: 9_000,
      bands: [
        [0, 0],
        [5_000, 100],
        [20_000, 300],
        [35_000, 600],
        [50_000, 1100],
        [70_000, 1900],
        [100_000, 2500],
        [400_000, 2600],
        [600_000, 2800],
        [2_000_000, 3000],
      ],
      social: [[0, 70]],
    },
    pension: { kind: 'account', employee: 1100, employer: 1300, age: 60, basic: 0, replacement: 0 },
    benefits: ['wage', 50, 6],
    health: ['universal', 90],
    rates: [250, 275, 200, 320],
  }),
  rules({
    code: 'SG',
    edu: {
      pre: 3,
      start: 7,
      primary: [6, 'Primary school (P1-P6)', 'PSLE'],
      lower: [4, 'Secondary school', 'GCE O-Level'],
      upper: [2, 'Junior college', 'GCE A-Level'],
      compulsory: 12,
      yearStart: 1,
      tuition: [150, 600],
      privateSchool: 45,
      loans: true,
    },
    work: [13, 190, 40],
    tax: {
      yearStart: 1,
      bands: [
        [0, 0],
        [20_000, 200],
        [30_000, 350],
        [40_000, 700],
        [80_000, 1150],
        [120_000, 1500],
        [160_000, 1800],
        [200_000, 1900],
        [240_000, 1950],
        [280_000, 2000],
        [320_000, 2200],
        [500_000, 2300],
      ],
      social: [[0, 0]],
    },
    pension: { kind: 'account', employee: 2000, employer: 1700, age: 65, basic: 0, replacement: 0 },
    benefits: ['flat', 20, 6],
    health: ['mixed', 70],
    rates: [150, 200, 150, 200],
  }),
  rules({
    code: 'ID',
    edu: {
      pre: 4,
      start: 7,
      primary: [6, 'Elementary school (SD)', null],
      lower: [3, 'Junior high school (SMP)', null],
      upper: [3, 'Senior high school (SMA/SMK)', null],
      compulsory: 15,
      yearStart: 7,
      tuition: [270, 900],
      privateSchool: 50,
      loans: false,
    },
    work: [15, 173, 60],
    tax: {
      yearStart: 1,
      allowance: 54_000_000,
      bands: [
        [0, 500],
        [60_000_000, 1500],
        [250_000_000, 2500],
        [500_000_000, 3000],
        [5_000_000_000, 3500],
      ],
      social: [[0, 200]],
    },
    pension: { kind: 'account', employee: 200, employer: 370, age: 58, basic: 0, replacement: 0 },
    benefits: ['wage', 35, 6],
    health: ['universal', 80],
    rates: [300, 575, 200, 480],
  }),
  rules({
    code: 'TH',
    edu: {
      pre: 3,
      start: 6,
      primary: [6, 'Primary school (Prathom 1-6)', null],
      lower: [3, 'Lower secondary (Mattayom 1-3)', null],
      upper: [3, 'Upper secondary (Mattayom 4-6)', 'TCAS admission exams'],
      compulsory: 15,
      yearStart: 5,
      tuition: [200, 700],
      privateSchool: 53,
      loans: true,
    },
    work: [15, 208, 45],
    tax: {
      yearStart: 1,
      allowance: 160_000,
      bands: [
        [0, 0],
        [150_000, 500],
        [300_000, 1000],
        [500_000, 1500],
        [750_000, 2000],
        [1_000_000, 2500],
        [2_000_000, 3000],
        [5_000_000, 3500],
      ],
      social: [[0, 500]],
    },
    pension: { kind: 'state', employee: 0, employer: 0, age: 55, basic: 5, replacement: 2000 },
    benefits: ['wage', 50, 6],
    health: ['universal', 90],
    rates: [100, 225, 100, 100],
  }),
  rules({
    code: 'JP',
    edu: {
      pre: 3,
      start: 6,
      primary: [6, 'Elementary school (Shōgakkō)', null],
      lower: [3, 'Junior high school (Chūgakkō)', null],
      upper: [3, 'Senior high school (Kōtōgakkō)', 'Common Test for University Admissions'],
      compulsory: 15,
      yearStart: 4,
      tuition: [180, 330],
      privateSchool: 20,
      loans: true,
    },
    work: [15, 160, 55],
    tax: {
      yearStart: 1,
      allowance: 1_500_000,
      bands: [
        [0, 1500],
        [1_950_000, 2000],
        [3_300_000, 3000],
        [6_950_000, 3300],
        [9_000_000, 4300],
        [18_000_000, 5000],
        [40_000_000, 5500],
      ],
      social: [[0, 560]],
    },
    pension: { kind: 'state', employee: 915, employer: 915, age: 65, basic: 23, replacement: 2000 },
    benefits: ['wage', 60, 4],
    health: ['universal', 70],
    rates: [20, 50, 300, 250],
  }),
  rules({
    code: 'KR',
    edu: {
      pre: 3,
      start: 6,
      primary: [6, 'Elementary school', null],
      lower: [3, 'Middle school', null],
      upper: [3, 'High school', 'CSAT (Suneung)'],
      compulsory: 15,
      yearStart: 3,
      tuition: [150, 260],
      privateSchool: 33,
      loans: true,
    },
    work: [15, 209, 65],
    tax: {
      yearStart: 1,
      allowance: 12_000_000,
      bands: [
        [0, 600],
        [14_000_000, 1500],
        [50_000_000, 2400],
        [88_000_000, 3500],
        [150_000_000, 3800],
        [300_000_000, 4000],
        [500_000_000, 4200],
        [1_000_000_000, 4500],
      ],
      social: [[0, 490]],
    },
    pension: { kind: 'state', employee: 475, employer: 475, age: 63, basic: 11, replacement: 2500 },
    benefits: ['wage', 60, 6],
    health: ['universal', 70],
    rates: [250, 250, 200, 280],
  }),
  rules({
    code: 'CN',
    edu: {
      pre: 3,
      start: 6,
      primary: [6, 'Primary school', null],
      lower: [3, 'Junior middle school', 'Zhongkao'],
      upper: [3, 'Senior high school', 'Gaokao'],
      compulsory: 15,
      yearStart: 9,
      tuition: [77, 300],
      privateSchool: 46,
      loans: true,
    },
    work: [16, 174, 40],
    tax: {
      yearStart: 1,
      allowance: 60_000,
      bands: [
        [0, 300],
        [36_000, 1000],
        [144_000, 2000],
        [300_000, 2500],
        [420_000, 3000],
        [660_000, 3500],
        [960_000, 4500],
      ],
      social: [[0, 250]],
    },
    pension: { kind: 'state', employee: 800, employer: 1600, age: 60, basic: 0, replacement: 3500 },
    benefits: ['wage', 30, 6],
    health: ['mixed', 60],
    rates: [100, 300, 50, 500],
  }),
  rules({
    code: 'IN',
    edu: {
      pre: 3,
      start: 6,
      primary: [5, 'Primary school (Classes 1-5)', null],
      lower: [5, 'Middle and secondary school (Classes 6-10)', 'Class 10 board exams'],
      upper: [2, 'Higher secondary (Classes 11-12)', 'Class 12 board exams'],
      compulsory: 14,
      yearStart: 4,
      tuition: [250, 1000],
      privateSchool: 25,
      loans: true,
    },
    work: [14, 208, 45],
    tax: {
      yearStart: 4,
      allowance: 75_000,
      taxFreeBelow: 1_275_000,
      bands: [
        [0, 0],
        [400_000, 500],
        [800_000, 1000],
        [1_200_000, 1500],
        [1_600_000, 2000],
        [2_000_000, 2500],
        [2_400_000, 3000],
      ],
      social: [[0, 0]],
    },
    pension: { kind: 'account', employee: 1200, employer: 1200, age: 58, basic: 0, replacement: 0 },
    benefits: ['none', 0, 0],
    health: ['mixed', 40],
    rates: [300, 550, 300, 500],
  }),
  rules({
    code: 'AU',
    edu: {
      pre: 4,
      start: 5,
      primary: [7, 'Primary school (Foundation-Year 6)', null],
      lower: [4, 'Secondary school (Years 7-10)', null],
      upper: [2, 'Senior secondary (Years 11-12)', 'Year 12 certificate (ATAR)'],
      compulsory: 17,
      yearStart: 2,
      tuition: [180, 450],
      privateSchool: 25,
      loans: true,
    },
    work: [14, 165, 60],
    tax: {
      yearStart: 7,
      bands: [
        [0, 0],
        [18_200, 1600],
        [45_000, 3000],
        [135_000, 3700],
        [190_000, 4500],
      ],
      social: [[0, 200]],
    },
    pension: { kind: 'account', employee: 0, employer: 1200, age: 67, basic: 19, replacement: 0 },
    benefits: ['flat', 13, 24],
    health: ['universal', 85],
    rates: [450, 360, 300, 420],
  }),
  rules({
    code: 'NZ',
    edu: {
      pre: 3,
      start: 5,
      primary: [8, 'Primary and intermediate school (Years 1-8)', null],
      lower: [2, 'Secondary school (Years 9-10)', null],
      upper: [3, 'Senior secondary (Years 11-13)', 'NCEA'],
      compulsory: 16,
      yearStart: 2,
      tuition: [160, 400],
      privateSchool: 40,
      loans: true,
    },
    work: [14, 160, 70],
    tax: {
      yearStart: 4,
      bands: [
        [0, 1050],
        [15_600, 1750],
        [53_500, 3000],
        [78_100, 3300],
        [180_000, 3900],
      ],
      social: [[0, 160]],
    },
    pension: { kind: 'account', employee: 300, employer: 300, age: 65, basic: 45, replacement: 0 },
    benefits: ['flat', 28, 24],
    health: ['universal', 85],
    rates: [350, 250, 300, 530],
  }),
  rules({
    code: 'US',
    edu: {
      pre: 4,
      start: 6,
      primary: [5, 'Elementary school (Grades 1-5)', null],
      lower: [3, 'Middle school (Grades 6-8)', null],
      upper: [4, 'High school (Grades 9-12)', 'SAT/ACT'],
      compulsory: 17,
      yearStart: 9,
      tuition: [230, 860],
      privateSchool: 20,
      loans: true,
    },
    work: [14, 173, 35],
    tax: {
      yearStart: 1,
      allowance: 15_000,
      bands: [
        [0, 1400],
        [11_925, 1600],
        [48_475, 2600],
        [103_350, 2800],
        [197_300, 3600],
        [250_525, 3900],
        [626_350, 4100],
      ],
      social: [[0, 765]],
    },
    pension: {
      kind: 'state',
      employee: 0,
      employer: 0,
      match: 400,
      age: 67,
      basic: 0,
      replacement: 4000,
    },
    benefits: ['wage', 45, 6],
    health: ['insurance', 30, true],
    rates: [400, 375, 280, 440],
  }),
  rules({
    code: 'CA',
    edu: {
      pre: 4,
      start: 6,
      primary: [6, 'Elementary school (Grades 1-6)', null],
      lower: [2, 'Middle school (Grades 7-8)', null],
      upper: [4, 'High school (Grades 9-12)', null],
      compulsory: 18,
      yearStart: 9,
      tuition: [156, 500],
      privateSchool: 31,
      loans: true,
    },
    work: [14, 173, 55],
    tax: {
      yearStart: 1,
      allowance: 16_129,
      bands: [
        [0, 2000],
        [57_375, 2960],
        [114_750, 3700],
        [177_882, 4100],
        [253_414, 4600],
      ],
      social: [[0, 759]],
    },
    pension: { kind: 'state', employee: 0, employer: 0, age: 65, basic: 15, replacement: 2500 },
    benefits: ['wage', 55, 6],
    health: ['universal', 90],
    rates: [250, 225, 220, 680],
  }),
  rules({
    code: 'GB',
    edu: {
      pre: 3,
      start: 4,
      primary: [7, 'Primary school (Reception-Year 6)', null],
      lower: [5, 'Secondary school (Years 7-11)', 'GCSEs'],
      upper: [2, 'Sixth form', 'A-levels'],
      compulsory: 18,
      yearStart: 9,
      tuition: [318, 600],
      privateSchool: 50,
      loans: true,
    },
    work: [13, 163, 60],
    tax: {
      yearStart: 4,
      bands: [
        [0, 0],
        [12_570, 2000],
        [50_270, 4000],
        [125_140, 4500],
      ],
      social: [
        [0, 0],
        [12_570, 800],
        [50_270, 200],
      ],
    },
    pension: { kind: 'account', employee: 500, employer: 300, age: 66, basic: 33, replacement: 0 },
    benefits: ['flat', 13, 6],
    health: ['universal', 100],
    rates: [400, 400, 380, 500],
  }),
  rules({
    code: 'FR',
    edu: {
      pre: 3,
      start: 6,
      primary: [5, 'École élémentaire (CP-CM2)', null],
      lower: [4, 'Collège', 'Diplôme national du brevet'],
      upper: [3, 'Lycée', 'Baccalauréat'],
      compulsory: 16,
      yearStart: 9,
      tuition: [6, 300],
      privateSchool: 6,
      loans: false,
    },
    work: [16, 152, 65],
    tax: {
      yearStart: 1,
      bands: [
        [0, 0],
        [11_497, 1100],
        [29_315, 3000],
        [83_823, 4100],
        [180_294, 4500],
      ],
      social: [[0, 2200]],
    },
    pension: { kind: 'state', employee: 0, employer: 0, age: 64, basic: 0, replacement: 5000 },
    benefits: ['wage', 57, 18],
    health: ['universal', 80],
    rates: [170, 200, 100, 750],
  }),
  rules({
    code: 'DE',
    edu: {
      pre: 3,
      start: 6,
      primary: [4, 'Grundschule', null],
      lower: [6, 'Secondary school (Sekundarstufe I)', 'Mittlerer Schulabschluss'],
      upper: [3, 'Gymnasiale Oberstufe', 'Abitur'],
      compulsory: 16,
      yearStart: 9,
      tuition: [8, 300],
      privateSchool: 8,
      loans: true,
    },
    work: [15, 165, 60],
    tax: {
      yearStart: 1,
      bands: [
        [0, 0],
        [12_096, 2000],
        [17_443, 3000],
        [68_480, 4200],
        [277_825, 4500],
      ],
      social: [[0, 2050]],
    },
    pension: { kind: 'state', employee: 0, employer: 0, age: 67, basic: 0, replacement: 4800 },
    benefits: ['wage', 60, 12],
    health: ['universal', 95],
    rates: [200, 200, 220, 600],
  }),
  rules({
    code: 'IT',
    edu: {
      pre: 3,
      start: 6,
      primary: [5, 'Scuola primaria', null],
      lower: [3, 'Scuola secondaria di primo grado', 'Esame di Stato del primo ciclo'],
      upper: [5, 'Scuola secondaria di secondo grado', 'Maturità'],
      compulsory: 16,
      yearStart: 9,
      tuition: [74, 400],
      privateSchool: 17,
      loans: false,
    },
    work: [16, 165, 60],
    tax: {
      yearStart: 1,
      allowance: 8_500,
      bands: [
        [0, 2500],
        [28_000, 3700],
        [50_000, 4500],
      ],
      social: [[0, 920]],
    },
    pension: { kind: 'state', employee: 0, employer: 0, age: 67, basic: 0, replacement: 6000 },
    benefits: ['wage', 65, 12],
    health: ['universal', 90],
    rates: [100, 200, 150, 610],
  }),
  rules({
    code: 'BR',
    edu: {
      pre: 4,
      start: 6,
      primary: [5, 'Ensino Fundamental I', null],
      lower: [4, 'Ensino Fundamental II', null],
      upper: [3, 'Ensino Médio', 'ENEM'],
      compulsory: 17,
      yearStart: 2,
      tuition: [0, 430],
      privateSchool: 35,
      loans: true,
    },
    work: [14, 190, 55],
    tax: {
      yearStart: 1,
      bands: [
        [0, 0],
        [29_146, 750],
        [33_920, 1500],
        [45_013, 2250],
        [55_976, 2750],
      ],
      social: [[0, 900]],
    },
    pension: { kind: 'state', employee: 0, employer: 0, age: 65, basic: 0, replacement: 7000 },
    benefits: ['wage', 70, 4],
    health: ['universal', 80],
    rates: [600, 1500, 480, 580],
  }),
  rules({
    code: 'ZA',
    edu: {
      pre: 5,
      start: 7,
      primary: [7, 'Primary school (Grades 1-7)', null],
      lower: [2, 'Senior phase (Grades 8-9)', null],
      upper: [3, 'Further education and training (Grades 10-12)', 'National Senior Certificate'],
      compulsory: 15,
      yearStart: 1,
      tuition: [670, 1300],
      privateSchool: 44,
      loans: true,
    },
    work: [15, 195, 30],
    tax: {
      yearStart: 3,
      bands: [
        [0, 0],
        [95_750, 1800],
        [237_100, 2600],
        [370_500, 3100],
        [512_800, 3600],
        [673_000, 3900],
        [857_900, 4100],
        [1_817_000, 4500],
      ],
      social: [[0, 100]],
    },
    pension: { kind: 'account', employee: 750, employer: 750, age: 60, basic: 26, replacement: 0 },
    benefits: ['wage', 50, 8],
    health: ['mixed', 50],
    rates: [600, 675, 350, 3300],
  }),
  rules({
    code: 'AE',
    edu: {
      pre: 4,
      start: 6,
      primary: [4, 'Cycle 1 (Grades 1-4)', null],
      lower: [4, 'Cycle 2 (Grades 5-8)', null],
      upper: [4, 'Cycle 3 (Grades 9-12)', null],
      compulsory: 18,
      yearStart: 9,
      tuition: [0, 500],
      privateSchool: 33,
      loans: false,
    },
    work: [15, 208, 25],
    tax: { yearStart: 1, bands: [[0, 0]], social: [[0, 0]] },
    pension: { kind: 'account', employee: 0, employer: 0, age: 60, basic: 0, replacement: 0 },
    benefits: ['wage', 60, 3],
    health: ['insurance', 70, true],
    rates: [300, 390, 200, 200],
  }),
  rules({
    code: 'SA',
    edu: {
      pre: 4,
      start: 6,
      primary: [6, 'Elementary school', null],
      lower: [3, 'Intermediate school', null],
      upper: [3, 'Secondary school', 'Qudurat and Tahsili'],
      compulsory: 15,
      yearStart: 8,
      tuition: [0, 500],
      privateSchool: 25,
      loans: false,
    },
    work: [15, 208, 50],
    tax: { yearStart: 1, bands: [[0, 0]], social: [[0, 75]] },
    pension: { kind: 'state', employee: 900, employer: 900, age: 60, basic: 0, replacement: 5000 },
    benefits: ['wage', 55, 6],
    health: ['universal', 90],
    rates: [300, 450, 200, 350],
  }),
];

const BY_CODE = new Map(COUNTRY_RULES.map((r) => [r.code, r]));

export function getRules(code: string): CountryRules {
  const found = BY_CODE.get(code);
  if (!found) throw new Error(`No institutional rules for ${code}`);
  return found;
}

/** Major units to minor units for a country's currency. */
export function majorToMinor(code: string, major: number): bigint {
  const exponent = getCountry(code).currency.exponent;
  return BigInt(major) * 10n ** BigInt(exponent);
}

/** Median monthly wage at the start of the game, minor units. */
export function baseMedianWage(code: string): bigint {
  return BigInt(getCountry(code).economy.medianMonthlyWageMinor);
}

/** Tax bands converted to minor units (cached per country). */
const bandCache = new Map<string, { fromMinor: bigint; rateBp: number }[]>();
const socialCache = new Map<string, { fromMinor: bigint; rateBp: number }[]>();

export function taxBands(code: string): { fromMinor: bigint; rateBp: number }[] {
  let cached = bandCache.get(code);
  if (!cached) {
    cached = getRules(code).tax.bands.map(([from, rateBp]) => ({
      fromMinor: majorToMinor(code, from),
      rateBp,
    }));
    bandCache.set(code, cached);
  }
  return cached;
}

export function socialBands(code: string): { fromMinor: bigint; rateBp: number }[] {
  let cached = socialCache.get(code);
  if (!cached) {
    cached = getRules(code).tax.socialBands.map(([from, rateBp]) => ({
      fromMinor: majorToMinor(code, from),
      rateBp,
    }));
    socialCache.set(code, cached);
  }
  return cached;
}
