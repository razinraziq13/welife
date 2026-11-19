import type { SkillKey } from '../state/schema';

/**
 * Business types the player can run (spec §4 Business; §3.8 Business Tycoon). Prices,
 * wages and rents are percentages of the local median monthly wage (scaled by local costs),
 * so the same business works in every country's currency. All numbers PROPOSED TUNING.
 */
export interface BusinessType {
  id: string;
  name: string;
  industryId: string;
  /** Goods are bought from suppliers and held in stock; services only need capacity. */
  goods: boolean;
  unit: string;
  /** Reference price per unit, basis points of the median monthly wage. */
  refPriceBp: number;
  /** Cost of goods or materials, percent of the reference price. */
  unitCostPercent: number;
  /** Units one member of staff can deliver in a month. */
  capacityPerStaff: number;
  /**
   * Units one outlet sells in a month at reference prices when it is as attractive as its
   * competitors (a typical city). Markets with more outlets have proportionally more demand;
   * competition decides who wins it.
   */
  marketDemand: number;
  /** One-off set-up cost per outlet, months of the median wage. */
  setupMonths: number;
  /** Staff wage, percent of the median wage. */
  wagePercent: number;
  /** Premises rent per outlet, percent of the median wage. */
  rentPercent: number;
  /** Price sensitivity: % demand lost per 100% price rise. */
  elasticity: number;
  /** Share of unsold goods lost each month (perishables). */
  spoilagePercent: number;
  /** Owner skills that improve quality when the owner manages it. */
  skills: readonly SkillKey[];
  /** Typical staff for a new outlet. */
  startStaff: number;
  /** Valuation as a multiple of yearly profit when sold. */
  profitMultiple: number;
}

export const BUSINESS_TYPES: readonly BusinessType[] = [
  {
    id: 'cafe',
    name: 'Café',
    industryId: 'hospitality',
    goods: true,
    unit: 'orders',
    refPriceBp: 60,
    unitCostPercent: 35,
    capacityPerStaff: 800,
    marketDemand: 2700,
    setupMonths: 8,
    wagePercent: 100,
    rentPercent: 250,
    elasticity: 150,
    spoilagePercent: 20,
    skills: ['business', 'craft'],
    startStaff: 4,
    profitMultiple: 3,
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    industryId: 'hospitality',
    goods: true,
    unit: 'meals',
    refPriceBp: 150,
    unitCostPercent: 34,
    capacityPerStaff: 300,
    marketDemand: 1550,
    setupMonths: 15,
    wagePercent: 110,
    rentPercent: 350,
    elasticity: 130,
    spoilagePercent: 25,
    skills: ['craft', 'leadership'],
    startStaff: 6,
    profitMultiple: 3,
  },
  {
    id: 'boutique',
    name: 'Clothing boutique',
    industryId: 'retail',
    goods: true,
    unit: 'items',
    refPriceBp: 250,
    unitCostPercent: 50,
    capacityPerStaff: 250,
    marketDemand: 640,
    setupMonths: 10,
    wagePercent: 90,
    rentPercent: 250,
    elasticity: 170,
    spoilagePercent: 0,
    skills: ['business', 'art'],
    startStaff: 3,
    profitMultiple: 3,
  },
  {
    id: 'online-store',
    name: 'Online shop',
    industryId: 'retail',
    goods: true,
    unit: 'orders',
    refPriceBp: 200,
    unitCostPercent: 55,
    capacityPerStaff: 400,
    marketDemand: 680,
    setupMonths: 4,
    wagePercent: 100,
    rentPercent: 40,
    elasticity: 200,
    spoilagePercent: 0,
    skills: ['technology', 'business'],
    startStaff: 2,
    profitMultiple: 4,
  },
  {
    id: 'consultancy',
    name: 'Consultancy',
    industryId: 'consulting',
    goods: false,
    unit: 'billable days',
    refPriceBp: 3000,
    unitCostPercent: 5,
    capacityPerStaff: 16,
    marketDemand: 28,
    setupMonths: 3,
    wagePercent: 220,
    rentPercent: 120,
    elasticity: 110,
    spoilagePercent: 0,
    skills: ['business', 'leadership'],
    startStaff: 2,
    profitMultiple: 4,
  },
  {
    id: 'software',
    name: 'Software studio',
    industryId: 'technology',
    goods: false,
    unit: 'weeks of work',
    refPriceBp: 12000,
    unitCostPercent: 5,
    capacityPerStaff: 4,
    marketDemand: 10,
    setupMonths: 5,
    wagePercent: 250,
    rentPercent: 150,
    elasticity: 100,
    spoilagePercent: 0,
    skills: ['technology', 'logic'],
    startStaff: 3,
    profitMultiple: 5,
  },
  {
    id: 'fitness',
    name: 'Fitness studio',
    industryId: 'sports',
    goods: false,
    unit: 'memberships',
    refPriceBp: 300,
    unitCostPercent: 5,
    capacityPerStaff: 120,
    marketDemand: 310,
    setupMonths: 12,
    wagePercent: 90,
    rentPercent: 300,
    elasticity: 160,
    spoilagePercent: 0,
    skills: ['fitness', 'business'],
    startStaff: 3,
    profitMultiple: 3,
  },
  {
    id: 'salon',
    name: 'Hair and beauty salon',
    industryId: 'personalCare',
    goods: false,
    unit: 'appointments',
    refPriceBp: 200,
    unitCostPercent: 15,
    capacityPerStaff: 160,
    marketDemand: 410,
    setupMonths: 6,
    wagePercent: 85,
    rentPercent: 200,
    elasticity: 150,
    spoilagePercent: 0,
    skills: ['art', 'socializing'],
    startStaff: 3,
    profitMultiple: 3,
  },
  {
    id: 'contractor',
    name: 'Building contractor',
    industryId: 'construction',
    goods: false,
    unit: 'work days',
    refPriceBp: 1400,
    unitCostPercent: 18,
    capacityPerStaff: 20,
    marketDemand: 68,
    setupMonths: 10,
    wagePercent: 130,
    rentPercent: 80,
    elasticity: 120,
    spoilagePercent: 0,
    skills: ['craft', 'leadership'],
    startStaff: 4,
    profitMultiple: 3,
  },
  {
    id: 'workshop',
    name: 'Furniture workshop',
    industryId: 'manufacturing',
    goods: true,
    unit: 'pieces',
    refPriceBp: 2800,
    unitCostPercent: 35,
    capacityPerStaff: 15,
    marketDemand: 38,
    setupMonths: 12,
    wagePercent: 110,
    rentPercent: 200,
    elasticity: 140,
    spoilagePercent: 0,
    skills: ['craft', 'art'],
    startStaff: 3,
    profitMultiple: 3,
  },
  {
    id: 'delivery',
    name: 'Delivery service',
    industryId: 'logistics',
    goods: false,
    unit: 'deliveries',
    refPriceBp: 48,
    unitCostPercent: 20,
    capacityPerStaff: 500,
    marketDemand: 1700,
    setupMonths: 8,
    wagePercent: 90,
    rentPercent: 120,
    elasticity: 160,
    spoilagePercent: 0,
    skills: ['fitness', 'business'],
    startStaff: 4,
    profitMultiple: 3,
  },
  {
    id: 'guesthouse',
    name: 'Guest house',
    industryId: 'hospitality',
    goods: false,
    unit: 'room nights',
    refPriceBp: 500,
    unitCostPercent: 20,
    capacityPerStaff: 80,
    marketDemand: 200,
    setupMonths: 40,
    wagePercent: 90,
    rentPercent: 300,
    elasticity: 130,
    spoilagePercent: 0,
    skills: ['socializing', 'business'],
    startStaff: 3,
    profitMultiple: 4,
  },
];

const BY_ID = new Map(BUSINESS_TYPES.map((b) => [b.id, b]));

export function findBusinessType(id: string): BusinessType | undefined {
  return BY_ID.get(id);
}

export function getBusinessType(id: string): BusinessType {
  const type = BY_ID.get(id);
  if (!type) throw new Error(`Unknown business type ${id}`);
  return type;
}

/** Supplier tiers: unit cost and quality effects (a simple supply chain). */
export const SUPPLIERS = {
  budget: { costPercent: 85, quality: -100 },
  standard: { costPercent: 100, quality: 0 },
  premium: { costPercent: 120, quality: 120 },
} as const;

/** Employer on-costs (social contributions, benefits) on top of wages, percent. */
export const EMPLOYER_ONCOST_PERCENT = 10;
/** Utilities and sundries, percent of revenue, plus a fixed amount per outlet (% of median). */
export const OTHER_COSTS_PERCENT = 8;
export const OUTLET_FIXED_PERCENT = 5;
/** A hired manager costs this many staff wages. */
export const MANAGER_WAGES = 2;
/** Months of unpaid bills before a business fails. */
export const FAILURE_MONTHS = 6;
/** Severance per member of staff let go, months of wage. */
export const SEVERANCE_MONTHS = 1;
