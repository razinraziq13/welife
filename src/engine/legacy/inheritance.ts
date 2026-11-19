import { sortedValues } from '../core/data';
import { applyBp, maxBig, minBig } from '../core/money';
import { addBiography, addNotification, ageYears, nextId } from '../core/world';
import { emptyFinance } from '../characters/factory';
import { medianWage } from '../economy/economy';
import { currencyFor } from '../economy/finance';
import { convertCurrency } from '../economy/fx';
import { categoryAccount, openAccount, post } from '../economy/ledger';
import { getInstitutions } from '../world/institutions';
import { childrenOf, parentsOf, siblingsOf } from '../social/relationships';
import type { Account, Character, Estate, World } from '../state/schema';

/**
 * Inheritance (spec §4 Legacy, §8: inheritance reconciles). When someone who owns accounts
 * dies, their estate pays debts, then inheritance tax under the rules of the country they
 * lived in, then passes to their heirs: by will, or otherwise by intestacy (a married
 * partner and children first, then parents, then siblings). Where the law reserves a share
 * for children (forced heirship), a will must leave them at least half.
 *
 * Every movement is a balanced posting: the estate books bequests and tax as expenses and
 * unpaid debts as written off; heirs book an inheritance as income. Property and company
 * shares pass to the main heir together with any mortgage. PROPOSED TUNING: tax-free
 * allowances below are simplified from each country's rules.
 */

/** Tax-free allowance, months of the local median wage (simplified, PROPOSED TUNING). */
export const ALLOWANCE_MONTHS: Record<string, number> = {
  TH: 6600,
  JP: 120,
  KR: 165,
  US: 2800,
  GB: 108,
  FR: 37,
  DE: 100,
  IT: 435,
  BR: 0,
  ZA: 390,
};

export const MAX_BENEFICIARIES = 8;
/** Share of an estate reserved for children where forced heirship applies (simplified). */
export const RESERVED_FOR_CHILDREN_BP = 5000;

export type WillRejection =
  'unknownPerson' | 'self' | 'duplicate' | 'notHundred' | 'tooMany' | 'reservedShare' | 'tooYoung';

export const WILL_MESSAGES: Record<WillRejection, string> = {
  unknownPerson: 'Everyone in a will must be a living person you know.',
  self: 'You cannot leave your estate to yourself.',
  duplicate: 'Each person can appear only once.',
  notHundred: 'The shares must add up to 100%.',
  tooMany: `A will can name at most ${String(MAX_BENEFICIARIES)} people.`,
  reservedShare:
    'Where you live, your children are entitled to at least half of your estate together.',
  tooYoung: 'You can make a will from 18.',
};

export class WillError extends Error {
  readonly code: WillRejection;
  constructor(code: WillRejection) {
    super(WILL_MESSAGES[code]);
    this.name = 'WillError';
    this.code = code;
  }
}

function living(world: World, ids: readonly string[]): Character[] {
  return ids.map((id) => world.characters[id]).filter((c): c is Character => c?.death === null);
}

/** Intestacy: married partner and children; then parents; then siblings (equal shares). */
export function intestateHeirs(
  world: World,
  d: Character,
): { characterId: string; sharesBp: number }[] {
  const partner =
    d.partnership?.status === 'married' ? world.characters[d.partnership.partnerId] : undefined;
  const spouse = partner?.death === null ? partner : null;
  const children = living(world, childrenOf(world, d.id));
  const split = (people: Character[], totalBp: number) => {
    const out: { characterId: string; sharesBp: number }[] = [];
    if (people.length === 0) return out;
    const each = Math.floor(totalBp / people.length);
    people.forEach((p, i) => {
      out.push({
        characterId: p.id,
        sharesBp: i === people.length - 1 ? totalBp - each * (people.length - 1) : each,
      });
    });
    return out;
  };
  if (spouse && children.length > 0)
    return [{ characterId: spouse.id, sharesBp: 5000 }, ...split(children, 5000)];
  if (spouse) return [{ characterId: spouse.id, sharesBp: 10_000 }];
  if (children.length > 0) return split(children, 10_000);
  const parents = living(world, parentsOf(world, d.id));
  if (parents.length > 0) return split(parents, 10_000);
  return split(living(world, siblingsOf(world, d.id)), 10_000);
}

/** Validates and stores a will (spec §3.12 estate distribution). */
export function setWill(
  world: World,
  c: Character,
  beneficiaries: { characterId: string; sharesBp: number }[],
): void {
  if (ageYears(world, c) < 18) throw new WillError('tooYoung');
  if (beneficiaries.length > MAX_BENEFICIARIES) throw new WillError('tooMany');
  const ids = new Set<string>();
  let total = 0;
  for (const b of beneficiaries) {
    if (b.characterId === c.id) throw new WillError('self');
    if (ids.has(b.characterId)) throw new WillError('duplicate');
    if (world.characters[b.characterId]?.death !== null) throw new WillError('unknownPerson');
    ids.add(b.characterId);
    total += b.sharesBp;
  }
  if (total !== 10_000) throw new WillError('notHundred');
  if (getInstitutions(c.civic.residence.countryCode).inheritance.forcedHeirship) {
    const children = new Set(living(world, childrenOf(world, c.id)).map((k) => k.id));
    if (children.size > 0) {
      const toChildren = beneficiaries
        .filter((b) => children.has(b.characterId))
        .reduce((s, b) => s + b.sharesBp, 0);
      if (toChildren < RESERVED_FOR_CHILDREN_BP) throw new WillError('reservedShare');
    }
  }
  world.legacy.wills[c.id] = beneficiaries.map((b) => ({ ...b }));
  addBiography(world, c.id, 'legacy', 'bio.will', { people: beneficiaries.length });
}

/** The will if every beneficiary is still alive, otherwise intestacy. */
export function beneficiariesOf(
  world: World,
  d: Character,
): { heirs: { characterId: string; sharesBp: number }[]; byWill: boolean } {
  const will = world.legacy.wills[d.id];
  if (will?.every((b) => world.characters[b.characterId]?.death === null)) {
    return { heirs: will.map((b) => ({ ...b })), byWill: true };
  }
  return { heirs: intestateHeirs(world, d), byWill: false };
}

const CASH_TYPES = new Set(['checking', 'savings', 'investment', 'retirement']);

function openAccountsOf(world: World, id: string): Account[] {
  return sortedValues(world.ledger.accounts).filter(
    (a) =>
      a.ownerId === id &&
      a.closedTick === null &&
      a.type !== 'income' &&
      a.type !== 'expense' &&
      a.type !== 'equity',
  );
}

/** The account an heir receives money into (opened if they have none). */
function receivingAccount(world: World, heir: Character): string {
  // An heir who runs a household receives into the household budget (survivors keep paying bills).
  const home = world.households[heir.householdId]?.finance;
  if (home?.headId === heir.id && world.ledger.accounts[home.checkingId]?.closedTick === null)
    return home.checkingId;
  heir.finance ??= emptyFinance(world.tick);
  if (
    heir.finance.checkingId &&
    world.ledger.accounts[heir.finance.checkingId]?.closedTick === null
  )
    return heir.finance.checkingId;
  if (heir.finance.savingsId && world.ledger.accounts[heir.finance.savingsId]?.closedTick === null)
    return heir.finance.savingsId;
  heir.finance.savingsId = openAccount(world, heir.id, 'savings', currencyFor(heir.countryCode));
  return heir.finance.savingsId;
}

/** Moves an asset value out of the estate and (converted) into an heir's account. */
function bequeath(
  world: World,
  d: Character,
  from: Account,
  amount: bigint,
  heir: Character | null,
  intoId: string | null,
): bigint {
  if (amount <= 0n) return 0n;
  post(
    world,
    'tx.bequest',
    [
      {
        accountId: categoryAccount(world, d.id, 'expense', 'bequests', from.currency),
        debit: amount,
      },
      { accountId: from.id, credit: amount },
    ],
    { params: { name: heir?.identity.firstName ?? '' } },
  );
  if (!heir || !intoId) return amount;
  const into = world.ledger.accounts[intoId];
  if (!into) return amount;
  const received = convertCurrency(world, amount, from.currency, into.currency);
  if (received > 0n)
    post(
      world,
      'tx.inheritance',
      [
        { accountId: intoId, debit: received },
        {
          accountId: categoryAccount(world, heir.id, 'income', 'inheritance', into.currency),
          credit: received,
        },
      ],
      { params: { name: d.identity.firstName } },
    );
  return amount;
}

/** Hands over a whole asset or debt account (property, mortgage, stake) to an heir. */
function handOver(
  world: World,
  d: Character,
  account: Account,
  heir: Character,
  currency: string,
): string {
  const next = openAccount(
    world,
    heir.id,
    account.type as 'property' | 'stake' | 'loan',
    currency,
    {
      category: account.category,
      rateBp: account.rateBp,
    },
  );
  const created = world.ledger.accounts[next];
  if (created && account.loan) created.loan = { ...account.loan };
  const amount = account.balance;
  const value = convertCurrency(world, amount, account.currency, currency);
  const liability = account.type === 'loan';
  if (amount > 0n) {
    post(
      world,
      liability ? 'tx.debtPassed' : 'tx.bequest',
      liability
        ? [
            { accountId: account.id, debit: amount },
            {
              accountId: categoryAccount(world, d.id, 'income', 'debtsPassedOn', account.currency),
              credit: amount,
            },
          ]
        : [
            {
              accountId: categoryAccount(world, d.id, 'expense', 'bequests', account.currency),
              debit: amount,
            },
            { accountId: account.id, credit: amount },
          ],
      { params: { name: heir.identity.firstName } },
    );
  }
  if (value > 0n) {
    post(
      world,
      liability ? 'tx.debtInherited' : 'tx.inheritance',
      liability
        ? [
            {
              accountId: categoryAccount(world, heir.id, 'expense', 'inheritedDebts', currency),
              debit: value,
            },
            { accountId: next, credit: value },
          ]
        : [
            { accountId: next, debit: value },
            {
              accountId: categoryAccount(world, heir.id, 'income', 'inheritance', currency),
              credit: value,
            },
          ],
      { params: { name: d.identity.firstName } },
    );
  }
  world.ledger.accounts[account.id] = { ...account, closedTick: world.tick };
  return next;
}

/**
 * A household whose budget used the deceased's own accounts gets accounts of its own (the old
 * ones belong to the estate), and a living member takes over running it.
 */
export function detachHouseholds(world: World, d: Character): void {
  for (const h of Object.values(world.households)) {
    const f = h.finance;
    if (!f) continue;
    const checking = world.ledger.accounts[f.checkingId];
    const savings = world.ledger.accounts[f.savingsId];
    if (checking?.ownerId !== d.id && savings?.ownerId !== d.id) continue;
    const cur = checking?.currency ?? currencyFor(d.countryCode);
    if (checking?.ownerId === d.id) f.checkingId = openAccount(world, h.id, 'checking', cur);
    if (savings?.ownerId === d.id)
      f.savingsId = openAccount(world, h.id, 'savings', cur, { rateBp: savings.rateBp });
    if (f.headId === d.id) {
      const next = h.memberIds
        .map((id) => world.characters[id])
        .filter((m): m is Character => m?.death === null)
        .sort((a, b) => a.birth.year * 12 + a.birth.month - (b.birth.year * 12 + b.birth.month))[0];
      if (next) f.headId = next.id;
    }
  }
}

/**
 * Settles a deceased person's estate. Returns the estate record (null when they owned
 * nothing in the ledger).
 */
export function settleEstate(world: World, d: Character): Estate | null {
  const accounts = openAccountsOf(world, d.id);
  if (accounts.length === 0) return null;
  const cur = currencyFor(d.countryCode);
  const country = d.civic.residence.countryCode;
  const { heirs: shares, byWill } = beneficiariesOf(world, d);
  const heirs = shares
    .map((s) => ({ ...s, c: world.characters[s.characterId] }))
    .filter((h): h is typeof h & { c: Character } => h.c?.death === null);
  const main =
    [...heirs].sort(
      (a, b) => b.sharesBp - a.sharesBp || (a.characterId < b.characterId ? -1 : 1),
    )[0]?.c ?? null;

  const value = (a: Account) => convertCurrency(world, a.balance, a.currency, cur);
  const gross = accounts
    .filter((a) => a.type !== 'loan' && a.type !== 'arrears')
    .reduce((s, a) => s + value(a), 0n);

  // 1. Debts (other than mortgages, which pass with their property) are paid from cash in
  // the same currency; what cannot be paid is written off (limited to the estate).
  let debts = 0n;
  let writtenOff = 0n;
  const cash = () =>
    openAccountsOf(world, d.id).filter((a) => CASH_TYPES.has(a.type) || a.type === 'checking');
  for (const debt of openAccountsOf(world, d.id)) {
    if (debt.type !== 'arrears' && !(debt.type === 'loan' && debt.loan?.product !== 'mortgage'))
      continue;
    for (const source of cash()) {
      if (debt.balance <= 0n) break;
      if (source.currency !== debt.currency || source.balance <= 0n) continue;
      const pay = minBig(debt.balance, source.balance);
      post(world, 'tx.estateDebt', [
        { accountId: debt.id, debit: pay },
        { accountId: source.id, credit: pay },
      ]);
      debts += value({ ...debt, balance: pay });
    }
    if (debt.balance > 0n) {
      writtenOff += value(debt);
      post(world, 'tx.debtWrittenOff', [
        { accountId: debt.id, debit: debt.balance },
        {
          accountId: categoryAccount(world, d.id, 'income', 'debtWrittenOff', debt.currency),
          credit: debt.balance,
        },
      ]);
    }
    world.ledger.accounts[debt.id] = { ...debt, closedTick: world.tick, balance: 0n };
  }

  // 2. Inheritance tax on the net estate above the allowance, paid from cash.
  const rules = getInstitutions(country).inheritance;
  const net = accounts.reduce((s, a) => {
    const live = world.ledger.accounts[a.id];
    if (live?.closedTick !== null) return s;
    return live.type === 'loan' ? s - value(live) : s + value(live);
  }, 0n);
  const allowance = medianWage(world, country) * BigInt(ALLOWANCE_MONTHS[country] ?? 0);
  const allowanceHome = convertCurrency(world, allowance, currencyFor(country), cur);
  let taxDue = rules.taxTopBp > 0 ? applyBp(maxBig(0n, net - allowanceHome), rules.taxTopBp) : 0n;
  let taxPaid = 0n;
  for (const source of cash()) {
    if (taxDue <= 0n) break;
    const available = value(source);
    if (available <= 0n) continue;
    const payHome = minBig(taxDue, available);
    const pay =
      source.currency === cur
        ? payHome
        : minBig(source.balance, convertCurrency(world, payHome, cur, source.currency));
    if (pay <= 0n) continue;
    post(world, 'tx.inheritanceTax', [
      {
        accountId: categoryAccount(world, d.id, 'expense', 'inheritanceTax', source.currency),
        debit: pay,
      },
      { accountId: source.id, credit: pay },
    ]);
    taxPaid += payHome;
    taxDue -= payHome;
  }

  // 3. Distribution: cash split by shares; property and company shares (and mortgages) to the
  // main heir. With no heirs at all, everything passes to the state (booked as a bequest).
  const amounts = new Map<string, bigint>();
  const into = new Map(heirs.map((h) => [h.characterId, receivingAccount(world, h.c)]));
  for (const account of openAccountsOf(world, d.id)) {
    if (!CASH_TYPES.has(account.type) || account.balance <= 0n) continue;
    let left = account.balance;
    heirs.forEach((h, i) => {
      const amount = i === heirs.length - 1 ? left : applyBp(account.balance, h.sharesBp);
      const paid = bequeath(
        world,
        d,
        account,
        minBig(amount, left),
        h.c,
        into.get(h.characterId) ?? null,
      );
      left -= paid;
      amounts.set(
        h.characterId,
        (amounts.get(h.characterId) ?? 0n) + convertCurrency(world, paid, account.currency, cur),
      );
    });
    if (left > 0n) bequeath(world, d, account, left, null, null);
  }
  for (const property of sortedValues(world.properties)) {
    const owner = property.owners.find((o) => o.ownerId === d.id);
    if (!owner || property.status !== 'owned') continue;
    const asset = owner.stakeAccountId ? world.ledger.accounts[owner.stakeAccountId] : undefined;
    if (!main) {
      // No heirs: the property passes out of the family.
      if (asset?.closedTick === null) bequeath(world, d, asset, asset.balance, null, null);
      property.status = 'sold';
      continue;
    }
    if (asset?.closedTick === null) {
      amounts.set(main.id, (amounts.get(main.id) ?? 0n) + value(asset));
      owner.stakeAccountId = handOver(world, d, asset, main, asset.currency);
    }
    const mortgage = property.mortgageAccountId
      ? world.ledger.accounts[property.mortgageAccountId]
      : undefined;
    if (mortgage?.closedTick === null && mortgage.ownerId === d.id) {
      amounts.set(main.id, (amounts.get(main.id) ?? 0n) - value(mortgage));
      property.mortgageAccountId = handOver(world, d, mortgage, main, mortgage.currency);
    }
    owner.ownerId = main.id;
  }
  for (const business of sortedValues(world.businesses)) {
    const owner = business.owners.find((o) => o.ownerId === d.id);
    if (!owner) continue;
    const stake = owner.stakeAccountId ? world.ledger.accounts[owner.stakeAccountId] : undefined;
    if (!main) {
      if (stake?.closedTick === null) bequeath(world, d, stake, stake.balance, null, null);
      if (stake)
        world.ledger.accounts[stake.id] = { ...stake, closedTick: world.tick, balance: 0n };
      owner.stakeAccountId = null;
      continue;
    }
    const heirCurrency = currencyFor(main.countryCode);
    const existing = business.owners.find((o) => o.ownerId === main.id);
    let next: string | null = null;
    if (stake?.closedTick === null) {
      amounts.set(main.id, (amounts.get(main.id) ?? 0n) + value(stake));
      next = handOver(world, d, stake, main, heirCurrency);
    }
    if (existing) {
      // Merge into the heir's existing holding (an owner appears only once).
      existing.sharesBp += owner.sharesBp;
      if (next) {
        const nextAccount = world.ledger.accounts[next];
        if (existing.stakeAccountId && nextAccount) {
          const target = world.ledger.accounts[existing.stakeAccountId];
          if (target?.currency === nextAccount.currency && nextAccount.balance > 0n) {
            post(world, 'tx.transfer', [
              { accountId: target.id, debit: nextAccount.balance },
              { accountId: nextAccount.id, credit: nextAccount.balance },
            ]);
          }
          world.ledger.accounts[next] = {
            ...(world.ledger.accounts[next] ?? nextAccount),
            closedTick: world.tick,
          };
        } else existing.stakeAccountId = next;
      }
      business.owners = business.owners.filter((o) => o !== owner);
    } else {
      owner.ownerId = main.id;
      owner.stakeAccountId = next;
    }
  }

  // 4. Anything left (accounts abroad, empty accounts) is closed.
  for (const account of openAccountsOf(world, d.id)) {
    if (account.balance > 0n)
      bequeath(world, d, account, account.balance, main, main ? (into.get(main.id) ?? null) : null);
    const live = world.ledger.accounts[account.id];
    if (live?.balance === 0n)
      world.ledger.accounts[account.id] = { ...live, closedTick: world.tick };
  }
  if (d.finance) {
    d.finance.checkingId = null;
    d.finance.savingsId = null;
    d.finance.retirementId = null;
  }

  const estate: Estate = {
    id: nextId(world, 'estate'),
    deceasedId: d.id,
    tick: world.tick,
    currency: cur,
    grossMinor: gross,
    debtsMinor: debts,
    writtenOffMinor: writtenOff,
    taxMinor: taxPaid,
    byWill,
    heirs: heirs.map((h) => ({
      characterId: h.characterId,
      sharesBp: h.sharesBp,
      amountMinor: amounts.get(h.characterId) ?? 0n,
    })),
  };
  world.legacy.estates = [...world.legacy.estates, estate].slice(-200);
  Reflect.deleteProperty(world.legacy.wills, d.id);
  const player = world.characters[world.activeCharacterId];
  for (const h of heirs) {
    if (
      h.characterId === player?.id ||
      world.legacy.lineage.some((l) => l.characterId === h.characterId)
    ) {
      addBiography(world, h.characterId, 'legacy', 'bio.inherited', { name: d.identity.firstName });
    }
  }
  if (player && heirs.some((h) => h.characterId === player.id))
    addNotification(world, 'legacy', 'ntf.inherited', { name: d.identity.firstName }, 'legacy');
  return estate;
}
