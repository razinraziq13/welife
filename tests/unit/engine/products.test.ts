import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { minimumCapital } from '@engine/business/business';
import { getBusinessType } from '@engine/business/catalog';
import { checkLedger } from '@engine/economy/ledger';
import type { Business } from '@engine/state/schema';
import type { SimState } from '@engine/core/commands';
import { checked, giveMoney, monthChecked } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** A wealthy adult in Malaysia who owns a café (a goods business). */
function cafeOwner(seed: string): SimState {
  let state = advanceMonths(newState({ seed, countryCode: 'MY', scenario: 'wealthy' }), 24 * 12);
  const locationId = playerOf(state).locationId;
  const capital = minimumCapital(state.world, getBusinessType('cafe'), locationId) * 2n;
  state = giveMoney(state, capital * 2n);
  return checked(state, {
    type: 'startBusiness',
    typeId: 'cafe',
    locationId,
    name: 'Corner Café',
    capitalMinor: capital.toString(),
  }).state;
}

const cafe = (s: SimState): Business => {
  const b = Object.values(s.world.businesses)[0];
  if (!b) throw new Error('no business');
  return b;
};

describe('business products (Career Expansion)', () => {
  it('a launched product sells, buys stock, pays for ads and keeps the books balanced', () => {
    let state = cafeOwner('products');
    const id = cafe(state).id;
    state = checked(state, {
      type: 'launchProduct',
      businessId: id,
      name: 'Bottled coffee',
      pricePercent: 100,
      supplier: 'premium',
    }).state;
    const product = cafe(state).products?.[0];
    if (!product) throw new Error('no product');
    expect(product.last).toBeNull();
    state = checked(state, {
      type: 'updateProduct',
      businessId: id,
      productId: product.id,
      pricePercent: 120,
      supplier: 'premium',
      stockTarget: 80,
      marketingMinor: '10000',
    }).state;
    state = monthChecked(state);
    const after = cafe(state).products?.[0];
    expect(after?.last?.sold).toBeGreaterThan(0);
    expect(after?.last?.cost).toBeGreaterThan(0n);
    expect(after?.last?.ads).toBe(10_000n);
    expect(checkLedger(state.world)).toEqual([]);
    expect(checkInvariants(state.world)).toEqual([]);
  }, 60_000);

  it('advertising raises demand; at most four products; drop removes it', () => {
    let state = cafeOwner('products-ads');
    const id = cafe(state).id;
    for (const name of ['A', 'B']) {
      state = checked(state, {
        type: 'launchProduct',
        businessId: id,
        name,
        pricePercent: 100,
        supplier: 'standard',
      }).state;
    }
    const [a, b] = cafe(state).products ?? [];
    if (!a || !b) throw new Error('no products');
    state = checked(state, {
      type: 'updateProduct',
      businessId: id,
      productId: a.id,
      pricePercent: 100,
      supplier: 'standard',
      stockTarget: 5000,
      marketingMinor: '5000000',
    }).state;
    state = checked(state, {
      type: 'updateProduct',
      businessId: id,
      productId: b.id,
      pricePercent: 100,
      supplier: 'standard',
      stockTarget: 5000,
      marketingMinor: '0',
    }).state;
    state = monthChecked(state);
    const [ra, rb] = cafe(state).products ?? [];
    expect(ra?.last?.demanded).toBeGreaterThan(rb?.last?.demanded ?? 0);

    for (const name of ['C', 'D'])
      state = checked(state, {
        type: 'launchProduct',
        businessId: id,
        name,
        pricePercent: 100,
        supplier: 'standard',
      }).state;
    const fifth = run(state, {
      type: 'launchProduct',
      businessId: id,
      name: 'E',
      pricePercent: 100,
      supplier: 'standard',
    });
    expect(fifth.outcome.status).toBe('rejected');
    state = checked(state, { type: 'discontinueProduct', businessId: id, productId: a.id }).state;
    expect(cafe(state).products?.length).toBe(3);
  }, 60_000);
});
