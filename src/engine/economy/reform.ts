import { divRound } from '../core/money';
import { addNotification } from '../core/world';
import type { World } from '../state/schema';
import { DEBIT_NORMAL } from './ledger';

/** Prices this far above the start trigger a currency reform (saves from before E87). */
const REFORM_AT_BP = 30_000;

export function scaleMoney(node: unknown, num: bigint, den: bigint): unknown {
  if (typeof node === 'bigint') return divRound(node * num, den);
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = scaleMoney(node[i], num, den);
  } else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = scaleMoney(record[key], num, den);
  }
  return node;
}

/**
 * Old saves had a century of compounded inflation. Once, the player's country redenominates:
 * every amount of money is divided by its price level, and the price, wage and house indices
 * drop by the same factor, so everything keeps its real value but reads in today's money.
 * Every bigint in the world is money (schema `Minor`), so one walk covers them all.
 */
export function currencyReform(world: World): void {
  const player = world.characters[world.activeCharacterId];
  const home = player && world.economy[player.countryCode];
  if (!home || home.priceIndexBp < REFORM_AT_BP) return;
  const num = 10_000n;
  const den = BigInt(home.priceIndexBp);
  const factor = Math.round(home.priceIndexBp / 10_000);
  scaleMoney(world, num, den);
  for (const e of Object.values(world.economy)) {
    const down = (v: number, min: number) =>
      Math.max(min, Math.round((v * 10_000) / home.priceIndexBp));
    e.priceIndexBp = down(e.priceIndexBp, 1000);
    e.priceIndexYearAgoBp = down(e.priceIndexYearAgoBp, 1000);
    e.wageIndexBp = down(e.wageIndexBp, 1000);
    e.housePriceBp = down(e.housePriceBp, 500);
  }
  // Rounding each amount can leave a few cents over: book them so the ledger still balances.
  const accounts = Object.values(world.ledger.accounts);
  const trial = new Map<string, bigint>();
  for (const a of accounts)
    trial.set(
      a.currency,
      (trial.get(a.currency) ?? 0n) + (DEBIT_NORMAL.has(a.type) ? a.balance : -a.balance),
    );
  for (const [currency, off] of trial) {
    const plug = accounts.find((a) => a.currency === currency && a.type === 'expense');
    if (off !== 0n && plug) plug.balance -= off;
  }
  for (const list of Object.values(world.ledger.journal))
    for (const tx of list)
      for (const currency of new Set(trial.keys())) {
        const own = tx.entries.filter(
          (e) => world.ledger.accounts[e.accountId]?.currency === currency,
        );
        const off = own.reduce((sum, e) => sum + e.debit - e.credit, 0n);
        const biggest = own.reduce<(typeof own)[number] | undefined>(
          (a, b) => (!a || b.debit > a.debit ? b : a),
          undefined,
        );
        if (off !== 0n && biggest) biggest.debit -= off;
      }
  addNotification(world, 'money', 'ntf.currencyReform', { factor }, 'finance');
}
