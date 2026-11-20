import { describe, expect, it } from 'vitest';
import { ensurePlayerAccounts } from '@engine/economy/finance';
import { checkLedger, netWorthOf } from '@engine/economy/ledger';
import { projectVehicleShop } from '@engine/economy/vehicles';
import { settleEstate, setWill } from '@engine/legacy/inheritance';
import { WorldSchema } from '@engine/state/schema';
import { giveMoney } from '../../helpers/reconcile';
import { newState, playerOf, run } from '../../helpers/sim';

function adult() {
  const state = newState({ countryCode: 'GB' });
  const player = playerOf(state);
  player.birth.year -= 25;
  ensurePlayerAccounts(state.world, player);
  return state;
}

describe('vehicle shopping', () => {
  it('offers used and new cars, aeroplanes and helicopters and books purchases as assets', () => {
    let state = giveMoney(adult(), 1_000_000_000n);
    const player = playerOf(state);
    const before = netWorthOf(state.world, player.id);
    const market = projectVehicleShop(state.world, player);
    const used = market.offers.find((offer) => offer.kind === 'car' && offer.yearsUsed > 0);
    const fresh = market.offers.find((offer) => offer.name === used?.name && offer.yearsUsed === 0);
    if (!used || !fresh) throw new Error('Expected both car listings');
    expect(used.priceMinor).toBeLessThan(fresh.priceMinor);
    expect(used.condition).toBeLessThan(fresh.condition);
    const plane = market.offers.find((offer) => offer.kind === 'aeroplane');
    const helicopter = market.offers.find((offer) => offer.kind === 'helicopter');
    if (!plane || !helicopter) throw new Error('Expected aircraft listings');
    for (const offer of [used, fresh, plane, helicopter]) {
      const result = run(state, { type: 'buyVehicle', offerId: offer.offerId });
      expect(result.outcome.status).toBe('applied');
      state = result.state;
    }
    const reloaded = WorldSchema.parse(state.world);
    const owned = projectVehicleShop(reloaded, playerOf(state)).owned;
    expect(owned.map((vehicle) => vehicle.kind)).toEqual(['car', 'car', 'aeroplane', 'helicopter']);
    expect(owned.map((vehicle) => vehicle.purchaseValueMinor)).toEqual(
      [used, fresh, plane, helicopter].map((offer) => offer.priceMinor),
    );
    expect(netWorthOf(reloaded, player.id)).toBe(before);
    expect(checkLedger(reloaded)).toEqual([]);
    expect(run(state, { type: 'buyVehicle', offerId: used.offerId }).outcome.status).toBe(
      'rejected',
    );
  });

  it('rejects unaffordable offers, underage purchases and offers from an expired month', () => {
    const child = newState({ countryCode: 'GB' });
    const kidOffer = projectVehicleShop(child.world, playerOf(child)).offers[0];
    if (!kidOffer) throw new Error('Expected a vehicle offer');
    expect(kidOffer.reason).toContain('age 18');
    expect(run(child, { type: 'buyVehicle', offerId: kidOffer.offerId }).outcome.status).toBe(
      'rejected',
    );

    const state = adult();
    const offer = projectVehicleShop(state.world, playerOf(state)).offers[0];
    if (!offer) throw new Error('Expected a vehicle offer');
    expect(offer.reason).toContain('enough cash');
    expect(run(state, { type: 'buyVehicle', offerId: offer.offerId }).outcome.status).toBe(
      'rejected',
    );
    const next = giveMoney(state, 1_000_000_000n);
    next.world.tick += 1;
    expect(run(next, { type: 'buyVehicle', offerId: offer.offerId }).outcome.status).toBe(
      'rejected',
    );
  });

  it('passes the purchased vehicle and its purchase value to the heir', () => {
    const state = giveMoney(adult(), 1_000_000_000n);
    const player = playerOf(state);
    const offer = projectVehicleShop(state.world, player).offers[0];
    if (!offer) throw new Error('Expected a vehicle offer');
    const bought = run(state, { type: 'buyVehicle', offerId: offer.offerId }).state;
    const owner = playerOf(bought);
    const parent = Object.values(bought.world.familyLinks).find(
      (link) => link.childId === owner.id,
    );
    const heir = bought.world.characters[parent?.parentId ?? ''];
    if (!heir) throw new Error('Expected an heir');
    setWill(bought.world, owner, [{ characterId: heir.id, sharesBp: 10_000 }]);
    settleEstate(bought.world, owner);
    expect(projectVehicleShop(bought.world, owner).owned).toHaveLength(0);
    expect(projectVehicleShop(bought.world, heir).owned[0]).toMatchObject({
      offerId: offer.offerId,
      name: offer.name,
      purchaseValueMinor: offer.priceMinor,
    });
    expect(checkLedger(bought.world)).toEqual([]);
  });
});
