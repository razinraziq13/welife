/**
 * Market baselines needed by Milestone 5: exchange rates, company tax and property transfer
 * costs. Status: BASELINE, UNVERIFIED (rounded, about 2025; researched with sources in
 * Milestone 6). After the game's start, exchange rates and prices are simulated (decision
 * R5, D4).
 */

export const MARKETS_SOURCE = {
  asOf: '2025',
  status: 'baseline-unverified' as const,
  note: 'Rounded approximations: exchange rates, headline company tax rates and typical buyer transfer costs.',
};

/** US dollars per one major unit of each currency, in millionths (e.g. 1 GBP = 1.30 USD). */
export const USD_MICRO_PER_MAJOR: Readonly<Record<string, number>> = {
  MYR: 227_000,
  SGD: 740_000,
  IDR: 61,
  THB: 29_000,
  JPY: 6_600,
  KRW: 710,
  CNY: 138_000,
  INR: 11_500,
  AUD: 650_000,
  NZD: 580_000,
  USD: 1_000_000,
  CAD: 720_000,
  GBP: 1_300_000,
  EUR: 1_120_000,
  BRL: 180_000,
  ZAR: 55_000,
  AED: 272_000,
  SAR: 267_000,
};

export interface CountryMarket {
  /** Headline company income tax, basis points. */
  corporateBp: number;
  /** Typical buyer transfer costs on property (stamp duty, notary, registration), basis points. */
  transferBp: number;
}

export const COUNTRY_MARKETS: Readonly<Record<string, CountryMarket>> = {
  MY: { corporateBp: 2400, transferBp: 300 },
  SG: { corporateBp: 1700, transferBp: 300 },
  ID: { corporateBp: 2200, transferBp: 500 },
  TH: { corporateBp: 2000, transferBp: 200 },
  JP: { corporateBp: 3000, transferBp: 300 },
  KR: { corporateBp: 2000, transferBp: 200 },
  CN: { corporateBp: 2500, transferBp: 150 },
  IN: { corporateBp: 2500, transferBp: 600 },
  AU: { corporateBp: 2500, transferBp: 400 },
  NZ: { corporateBp: 2800, transferBp: 50 },
  US: { corporateBp: 2500, transferBp: 200 },
  CA: { corporateBp: 1500, transferBp: 150 },
  GB: { corporateBp: 2500, transferBp: 200 },
  FR: { corporateBp: 2500, transferBp: 700 },
  DE: { corporateBp: 3000, transferBp: 500 },
  IT: { corporateBp: 2400, transferBp: 400 },
  BR: { corporateBp: 3400, transferBp: 300 },
  ZA: { corporateBp: 2700, transferBp: 400 },
  AE: { corporateBp: 900, transferBp: 400 },
  SA: { corporateBp: 2000, transferBp: 500 },
};

export function countryMarket(code: string): CountryMarket {
  const market = COUNTRY_MARKETS[code];
  if (!market) throw new Error(`No market baseline for ${code}`);
  return market;
}
