import { ASSET_TYPES, DEBIT_NORMAL, LIABILITY_TYPES, categoryAccount } from '../economy/ledger';
import type { World } from '../state/schema';

/**
 * Bounded history (spec §8: 10,000 months "without unbounded memory growth"). Once a year,
 * people who died long ago and matter to no lasting record are removed with everything that
 * only concerned them (relationships, memories, old jobs, applications).
 *
 * Always kept: the living; every character the player has been and all of their ancestors
 * (the family records); anyone who still owns ledger accounts that are in use; anyone named by a company, property, estate, will, house, achievement,
 * biography entry, civic or media record, calendar item, expected birth or follow-up; and
 * anyone who died within the last KEEP_YEARS.
 */

export const KEEP_YEARS = 30;

/** Owner of the archive equity accounts that hold closed books (one per currency). */
export const ARCHIVE_HOUSEHOLD_ID = 'hh_archive';

/**
 * Closes the books of people who died more than KEEP_YEARS ago. Their money passed to heirs
 * when the estate settled, so their asset and debt accounts stand at zero; what remains are
 * lifetime income and expense totals. Those totals are moved into an archive equity account
 * in the same currency (the trial balance is unchanged) and the person's accounts are removed.
 * Anyone whose accounts are still in use (a household budget, a company stake, a mortgage, a
 * transaction still in the journal) or who holds money keeps their books.
 */
function closeBooks(
  world: World,
  departed: ReadonlySet<string>,
  lineage: ReadonlySet<string>,
): void {
  const inUse = new Set<string>();
  for (const h of Object.values(world.households))
    if (h.finance) inUse.add(h.finance.checkingId).add(h.finance.savingsId);
  for (const b of Object.values(world.businesses)) {
    inUse.add(b.cashAccountId);
    for (const o of b.owners) if (o.stakeAccountId) inUse.add(o.stakeAccountId);
  }
  for (const p of Object.values(world.properties))
    if (p.mortgageAccountId) inUse.add(p.mortgageAccountId);
  for (const list of Object.values(world.ledger.journal))
    for (const tx of list) for (const e of tx.entries) inUse.add(e.accountId);
  const byOwner = new Map<string, string[]>();
  for (const a of Object.values(world.ledger.accounts))
    if (departed.has(a.ownerId)) byOwner.set(a.ownerId, [...(byOwner.get(a.ownerId) ?? []), a.id]);
  for (const ownerId of [...byOwner.keys()].sort()) {
    const ids = byOwner.get(ownerId) ?? [];
    const accounts = ids.map((id) => world.ledger.accounts[id]).filter((a) => a !== undefined);
    const blocked = accounts.some(
      (a) =>
        inUse.has(a.id) ||
        ((ASSET_TYPES.has(a.type) || LIABILITY_TYPES.has(a.type)) && a.balance !== 0n),
    );
    if (blocked) continue;
    const totals = new Map<string, bigint>();
    for (const a of accounts) {
      const signed = DEBIT_NORMAL.has(a.type) ? a.balance : -a.balance;
      totals.set(a.currency, (totals.get(a.currency) ?? 0n) + signed);
    }
    if ([...totals.values()].some((t) => t !== 0n)) ensureArchive(world);
    for (const [currency, signed] of [...totals].sort(([x], [y]) => (x < y ? -1 : 1))) {
      if (signed === 0n) continue;
      const archive =
        world.ledger.accounts[
          categoryAccount(world, ARCHIVE_HOUSEHOLD_ID, 'equity', 'archive', currency)
        ];
      // Equity is credit-normal: its signed (debit-positive) value is -balance.
      if (archive) archive.balance -= signed;
    }
    for (const a of accounts) Reflect.deleteProperty(world.ledger.accounts, a.id);
    if (!lineage.has(ownerId)) Reflect.deleteProperty(world.ledger.history, ownerId);
    const person = world.characters[ownerId];
    if (person?.finance) {
      person.finance.checkingId = null;
      person.finance.savingsId = null;
    }
  }
}

function ensureArchive(world: World): void {
  if (world.households[ARCHIVE_HOUSEHOLD_ID]) return;
  const anyHome = world.characters[world.activeCharacterId]?.householdId ?? '';
  world.households[ARCHIVE_HOUSEHOLD_ID] = {
    id: ARCHIVE_HOUSEHOLD_ID,
    locationId: world.households[anyHome]?.locationId ?? 'archive',
    memberIds: [],
    wealth: 'middle',
    scenario: 'middle',
    originCountryCode: null,
    flags: {
      royal: false,
      noble: false,
      political: false,
      businessHeir: false,
      immigrant: false,
      rural: false,
      singleParent: false,
      adopted: false,
    },
    familyTrade: null,
    finance: null,
  };
}

export function pruneDeparted(world: World): number {
  const keep = new Set<string>();
  const now = world.clock.year * 12 + world.clock.month;
  for (const c of Object.values(world.characters)) {
    if (c.death === null) keep.add(c.id);
    else if (now - (c.death.year * 12 + c.death.month) < KEEP_YEARS * 12) keep.add(c.id);
  }
  const keepRecent = new Set(keep);
  const parents = new Map<string, string[]>();
  for (const l of Object.values(world.familyLinks))
    parents.set(l.childId, [...(parents.get(l.childId) ?? []), l.parentId]);
  const visited = new Set<string>();
  const ancestors = (id: string) => {
    const stack = [id];
    while (stack.length > 0) {
      const next = stack.pop() ?? '';
      if (visited.has(next)) continue;
      visited.add(next);
      keep.add(next);
      for (const p of parents.get(next) ?? []) stack.push(p);
    }
  };
  ancestors(world.activeCharacterId);
  for (const l of world.legacy.lineage) ancestors(l.characterId);
  const mark = (id: string | null | undefined) => {
    if (id) keep.add(id);
  };
  const lineage = new Set(world.legacy.lineage.map((l) => l.characterId));
  closeBooks(
    world,
    new Set(
      Object.values(world.characters)
        .filter((c) => c.death !== null && !keepRecent.has(c.id))
        .map((c) => c.id),
    ),
    lineage,
  );
  for (const a of Object.values(world.ledger.accounts)) mark(a.ownerId);
  for (const h of Object.values(world.households)) mark(h.finance?.headId);
  for (const b of Object.values(world.businesses)) for (const o of b.owners) mark(o.ownerId);
  for (const p of Object.values(world.properties)) for (const o of p.owners) mark(o.ownerId);
  for (const e of world.legacy.estates) {
    mark(e.deceasedId);
    for (const h of e.heirs) mark(h.characterId);
  }
  for (const [id, will] of Object.entries(world.legacy.wills)) {
    mark(id);
    for (const b of will) mark(b.characterId);
  }
  for (const h of world.legacy.house?.heads ?? []) mark(h.characterId);
  mark(world.legacy.house?.headId);
  for (const id of world.legacy.succession?.candidates ?? []) mark(id);
  for (const u of Object.values(world.achievements)) mark(u.characterId);
  for (const b of world.biography) mark(b.characterId);
  for (const m of Object.values(world.media.profiles)) mark(m.characterId);
  const civic: Record<string, { characterId: string }>[] = [
    world.civics.applications,
    world.civics.conditions,
    world.civics.cases,
    world.civics.service,
    world.civics.politics,
  ];
  for (const group of civic) for (const r of Object.values(group)) mark(r.characterId);
  for (const key of Object.keys(world.civics.royal)) mark(key);
  for (const item of world.calendar.items) mark(item.withId);
  for (const e of world.expecting) for (const p of e.parentIds) mark(p);
  for (const s of world.events.scheduled) {
    mark(s.characterId);
    mark(s.subjectId);
  }
  for (const c of Object.values(world.characters))
    if (c.partnership && keep.has(c.id)) mark(c.partnership.partnerId);

  const removed = new Set(Object.keys(world.characters).filter((id) => !keep.has(id)));
  for (const id of removed) {
    Reflect.deleteProperty(world.characters, id);
    Reflect.deleteProperty(world.ledger.history, id);
  }
  for (const h of Object.values(world.households))
    h.memberIds = h.memberIds.filter((id) => !removed.has(id));
  for (const [id, l] of Object.entries(world.familyLinks))
    if (removed.has(l.childId) || removed.has(l.parentId))
      Reflect.deleteProperty(world.familyLinks, id);
  for (const [id, r] of Object.entries(world.relationships))
    if (removed.has(r.aId) || removed.has(r.bId)) Reflect.deleteProperty(world.relationships, id);
  for (const [id, m] of Object.entries(world.memories)) {
    if (removed.has(m.ownerId)) {
      Reflect.deleteProperty(world.memories, id);
      continue;
    }
    const subjects = m.subjectIds.filter((s) => !removed.has(s));
    if (subjects.length === 0) Reflect.deleteProperty(world.memories, id);
    else m.subjectIds = subjects;
  }
  for (const [id, e] of Object.entries(world.employment))
    if (removed.has(e.characterId)) Reflect.deleteProperty(world.employment, id);
  for (const [id, a] of Object.entries(world.jobs.applications))
    if (removed.has(a.characterId)) Reflect.deleteProperty(world.jobs.applications, id);
  for (const n of world.notifications) if (n.targetId && removed.has(n.targetId)) n.targetId = null;
  for (const i of Object.values(world.events.instances))
    if (i.subjectId && removed.has(i.subjectId)) i.subjectId = null;
  // Old jobs of people outside the family records are forgotten after KEEP_YEARS.
  for (const [id, e] of Object.entries(world.employment))
    if (
      e.status === 'ended' &&
      e.endTick !== null &&
      world.tick - e.endTick > KEEP_YEARS * 12 &&
      !lineage.has(e.characterId)
    )
      Reflect.deleteProperty(world.employment, id);
  pruneHouseholds(world);
  return removed.size;
}

/** Homes nobody lives in any more and that keep no budget are forgotten too. */
function pruneHouseholds(world: World): void {
  const used = new Set<string>();
  for (const c of Object.values(world.characters)) used.add(c.householdId);
  for (const a of Object.values(world.ledger.accounts)) used.add(a.ownerId);
  for (const e of world.expecting) used.add(e.householdId);
  for (const [id, h] of Object.entries(world.households))
    if (h.memberIds.length === 0 && h.finance === null && !used.has(id))
      Reflect.deleteProperty(world.households, id);
}
