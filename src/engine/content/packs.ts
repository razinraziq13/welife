import { z } from 'zod';
import { canonicalJson } from '../core/data';
import { validateEventSet, type Effect, type EventDefinition } from '../events/schema';
import { EVENTS } from './index';
import type { PackRecord, World } from '../state/schema';

/**
 * Content packs (spec §7, Milestone 8). A pack is plain data: event definitions in the
 * same declarative schema as built-in content, plus optional New Life scenario presets.
 * There is no code: no scripts, expressions or network references are accepted.
 *
 * Validation checks shape, field bounds, whitelisted facts and operators, references
 * (follow-ups must exist), scheduling cycles, clashes with built-in or other enabled
 * content, unsafe text, and the stricter limits of player-made packs. Every problem has a
 * field path. A pack that fails is never stored or enabled.
 */

export const PACK_FORMAT = 'welife-pack';
export const MAX_PACK_CHARS = 2 * 1024 * 1024;

/** Stricter limits for player-made packs (developer packs use the full schema bounds). */
export const PLAYER_LIMITS = {
  events: 50,
  chancePpm: 100_000,
  statDelta: 200,
  moneyPercent: 500,
  medicalPercent: 500,
  businessPercent: 1000,
};

export const PACK_TEXT_TOKENS = [
  'subject',
  'employer',
  'business',
  'property',
  'tenant',
  'name',
  'location',
  'country',
] as const;

export const ScenarioPresetSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
    name: z.string().min(1).max(60),
    description: z.string().max(240),
    countryCode: z.string().length(2),
    scenario: z.enum([
      'royal',
      'noble',
      'wealthy',
      'middle',
      'lowIncome',
      'immigrant',
      'singleParent',
      'adopted',
      'political',
      'businessHeir',
      'rural',
      'random',
    ]),
    originCountryCode: z.string().length(2).nullable(),
    difficulty: z.enum(['casual', 'realistic', 'challenging']),
    easyMigration: z.boolean(),
  })
  .strict();

export const PackFileSchema = z
  .object({
    format: z.literal(PACK_FORMAT),
    formatVersion: z.literal(1),
    id: z
      .string()
      .regex(/^[a-z][a-z0-9-]{2,39}$/, 'Use 3-40 lower-case letters, digits or hyphens.'),
    name: z.string().trim().min(1).max(60),
    packVersion: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'Use a version like 1.0.0.'),
    mode: z.enum(['player', 'developer']),
    author: z.string().max(60),
    description: z.string().max(400),
    events: z.array(z.unknown()).max(200),
    scenarios: z.array(ScenarioPresetSchema).max(20),
  })
  .strict();
export type PackFile = z.infer<typeof PackFileSchema>;

export interface PackIssue {
  path: string;
  message: string;
}

export interface PackValidation {
  ok: boolean;
  pack: PackFile | null;
  events: EventDefinition[];
  issues: PackIssue[];
}

/** Text must be plain: no markup, no links to code, only known {placeholders}. */
function checkText(path: string, text: string, issues: PackIssue[]): void {
  if (/<\s*[a-z!/]/i.test(text)) issues.push({ path, message: 'Text cannot contain markup.' });
  if (/javascript:|data:|https?:\/\//i.test(text))
    issues.push({ path, message: 'Text cannot contain links.' });
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    issues.push({ path, message: 'Text contains control characters.' });
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    const token = match[1] ?? '';
    if (!(PACK_TEXT_TOKENS as readonly string[]).includes(token))
      issues.push({ path, message: `Unknown placeholder {${token}}.` });
  }
}

function effectLimits(path: string, effect: Effect, issues: PackIssue[]): void {
  const over = (value: number, limit: number) => Math.abs(value) > limit;
  switch (effect.kind) {
    case 'stat':
    case 'need':
    case 'skill':
    case 'grade':
    case 'performance':
      if (over(effect.delta, PLAYER_LIMITS.statDelta))
        issues.push({
          path,
          message: `Player packs may change values by at most ${String(PLAYER_LIMITS.statDelta)}.`,
        });
      break;
    case 'money':
      if (over(effect.percent, PLAYER_LIMITS.moneyPercent))
        issues.push({
          path,
          message: `Player packs may move at most ${String(PLAYER_LIMITS.moneyPercent)}% of the median wage.`,
        });
      break;
    case 'medical':
      if (effect.percent > PLAYER_LIMITS.medicalPercent)
        issues.push({
          path,
          message: `Player packs may charge at most ${String(PLAYER_LIMITS.medicalPercent)}% for treatment.`,
        });
      break;
    case 'businessCash':
      if (over(effect.percent, PLAYER_LIMITS.businessPercent))
        issues.push({
          path,
          message: 'Player packs may move at most 1000% of the median wage in company cash.',
        });
      break;
    case 'action':
    case 'policy':
      issues.push({
        path,
        message: 'Player packs cannot use engine actions or economic policy effects.',
      });
      break;
    default:
      break;
  }
}

/**
 * Validates a pack. `otherIds` are event ids already in use by other enabled packs (built-in
 * ids are always checked).
 */
export function validatePack(
  raw: unknown,
  otherIds: ReadonlySet<string> = new Set(),
): PackValidation {
  const issues: PackIssue[] = [];
  const parsed = PackFileSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      issues.push({ path: issue.path.map(String).join('.') || '(pack)', message: issue.message });
    return { ok: false, pack: null, events: [], issues };
  }
  const pack = parsed.data;
  checkText('name', pack.name, issues);
  checkText('description', pack.description, issues);
  // Validate together with built-in content so follow-ups may target built-in events, then
  // keep only the issues that concern this pack.
  const builtIn = new Set(EVENTS.map((e) => e.id));
  const own = validateEventSet(pack.events);
  for (const issue of own.issues) {
    const index = /^\d+/.exec(issue.path)?.[0];
    if (index !== undefined) issues.push({ path: `events.${issue.path}`, message: issue.message });
    else if (!issue.message.startsWith('Schedules unknown event'))
      issues.push({ path: `events.${issue.path}`, message: issue.message });
  }
  const combined = validateEventSet([...EVENTS, ...own.events]);
  const ownIds = new Set(own.events.map((e) => e.id));
  for (const issue of combined.issues) {
    const id = issue.path.split('.')[0] ?? '';
    if (ownIds.has(id) && !issue.message.startsWith('Duplicate'))
      issues.push({ path: `events.${issue.path}`, message: issue.message });
  }
  // Text is checked on every event, even ones that failed the schema, so all problems show.
  pack.events.forEach((raw, i) => {
    const en = (raw as { text?: { en?: Record<string, unknown> } } | null)?.text?.en;
    if (!en || typeof en !== 'object') return;
    const at = `events.${String(i)}.text.en`;
    if (typeof en.title === 'string') checkText(`${at}.title`, en.title, issues);
    if (typeof en.body === 'string') checkText(`${at}.body`, en.body, issues);
    for (const group of ['choices', 'outcomes'] as const) {
      const record = en[group];
      if (!record || typeof record !== 'object') continue;
      for (const [key, value] of Object.entries(record as Record<string, unknown>))
        if (typeof value === 'string') checkText(`${at}.${group}.${key}`, value, issues);
    }
  });
  own.events.forEach((event) => {
    // Paths use the position in the pack file (invalid events are not in own.events).
    const index = pack.events.findIndex((r) => (r as { id?: unknown } | null)?.id === event.id);
    const at = `events.${String(index)}`;
    if (builtIn.has(event.id))
      issues.push({
        path: `${at}.id`,
        message: `"${event.id}" is a built-in event; choose another id.`,
      });
    if (otherIds.has(event.id))
      issues.push({
        path: `${at}.id`,
        message: `"${event.id}" is already used by another enabled pack.`,
      });
    if (pack.mode === 'player') {
      if (event.chancePpm > PLAYER_LIMITS.chancePpm)
        issues.push({
          path: `${at}.chancePpm`,
          message: `Player packs may use at most ${String(PLAYER_LIMITS.chancePpm)} parts per million.`,
        });
      event.effects.forEach((e, j) => {
        effectLimits(`${at}.effects.${String(j)}`, e, issues);
      });
      event.choices.forEach((choice, k) => {
        choice.effects.forEach((e, j) => {
          effectLimits(`${at}.choices.${String(k)}.effects.${String(j)}`, e, issues);
        });
      });
    }
  });
  if (pack.mode === 'player' && pack.events.length > PLAYER_LIMITS.events)
    issues.push({
      path: 'events',
      message: `Player packs may contain at most ${String(PLAYER_LIMITS.events)} events.`,
    });
  pack.scenarios.forEach((s, i) => {
    checkText(`scenarios.${String(i)}.name`, s.name, issues);
    checkText(`scenarios.${String(i)}.description`, s.description, issues);
  });
  const unique = new Map<string, PackIssue>();
  for (const issue of issues) unique.set(`${issue.path}|${issue.message}`, issue);
  const all = [...unique.values()];
  return { ok: all.length === 0, pack, events: own.events, issues: all };
}

// ------------------------------------------------------------------------------------------
// The events a world can use (built-in plus its enabled packs)
// ------------------------------------------------------------------------------------------

const cache = new WeakMap<
  readonly PackRecord[],
  { all: EventDefinition[]; byId: Map<string, EventDefinition> }
>();

function registry(world: World): { all: EventDefinition[]; byId: Map<string, EventDefinition> } {
  if (world.contentPacks.length === 0) {
    return { all: EVENTS as EventDefinition[], byId: BUILT_IN };
  }
  const hit = cache.get(world.contentPacks);
  if (hit) return hit;
  const byId = new Map(BUILT_IN);
  const enabled: EventDefinition[] = [];
  // Disabled (older) packs first so enabled ones win, keeping past events resolvable.
  const ordered = [...world.contentPacks].sort((a, b) => Number(a.enabled) - Number(b.enabled));
  for (const record of ordered) {
    for (const raw of record.events) {
      const event = raw as unknown as EventDefinition;
      if (!BUILT_IN.has(event.id)) byId.set(event.id, event);
      if (record.enabled && !BUILT_IN.has(event.id)) enabled.push(event);
    }
  }
  const all = [...EVENTS, ...enabled].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const entry = { all, byId };
  cache.set(world.contentPacks, entry);
  return entry;
}

const BUILT_IN = new Map(EVENTS.map((e) => [e.id, e]));

/** Events that may fire in this world (built-in and enabled packs), in id order. */
export function eventsFor(world: World): readonly EventDefinition[] {
  return registry(world).all;
}

export function findEventIn(world: World, id: string): EventDefinition | undefined {
  return registry(world).byId.get(id);
}

export function getEventIn(world: World, id: string): EventDefinition {
  const event = findEventIn(world, id);
  if (!event) throw new Error(`Unknown event ${id}`);
  return event;
}

export type PackRejection = 'invalid' | 'notFound' | 'alreadyEnabled' | 'notEnabled';

export class PackError extends Error {
  readonly code: PackRejection;
  readonly issues: PackIssue[];
  constructor(code: PackRejection, message: string, issues: PackIssue[] = []) {
    super(message);
    this.name = 'PackError';
    this.code = code;
    this.issues = issues;
  }
}

/** Enables a pack for this world (a newer version of the same pack replaces the older). */
export function enablePack(world: World, raw: unknown): PackRecord {
  const others = new Set<string>();
  for (const record of world.contentPacks) {
    if (!record.enabled) continue;
    const id = (raw as { id?: unknown } | null)?.id;
    if (record.id === id) continue;
    for (const e of record.events) others.add(String(e.id));
  }
  const result = validatePack(raw, others);
  if (!result.ok || !result.pack) {
    const first = result.issues[0];
    throw new PackError(
      'invalid',
      `The pack is not valid: ${first ? `${first.path}: ${first.message}` : 'unknown problem'}.`,
      result.issues,
    );
  }
  const pack = result.pack;
  const same = world.contentPacks.find((r) => r.id === pack.id && r.enabled);
  if (
    same?.packVersion === pack.packVersion &&
    canonicalJson(same.events) === canonicalJson(result.events)
  )
    throw new PackError('alreadyEnabled', 'This version of the pack is already enabled.');
  if (same) same.enabled = false;
  const record: PackRecord = {
    id: pack.id,
    name: pack.name,
    packVersion: pack.packVersion,
    mode: pack.mode,
    author: pack.author,
    enabled: true,
    enabledTick: world.tick,
    events: result.events,
  };
  world.contentPacks = [...world.contentPacks, record].slice(-20);
  return record;
}

export function disablePack(world: World, packId: string): void {
  const record = world.contentPacks.find((r) => r.id === packId && r.enabled);
  if (!record) throw new PackError('notEnabled', 'That pack is not enabled for this life.');
  record.enabled = false;
  const ids = new Set(record.events.map((e) => String(e.id)));
  // Follow-ups from a disabled pack no longer fire.
  world.events.scheduled = world.events.scheduled.filter((s) => !ids.has(s.eventId));
}

/**
 * Re-validates the packs stored in a world (used when a save is loaded or imported), so a
 * tampered save cannot smuggle in events that would not pass the editor's checks.
 */
export function storedPackIssues(world: World): string[] {
  const out: string[] = [];
  for (const record of world.contentPacks) {
    const others = new Set<string>();
    if (record.enabled) {
      for (const other of world.contentPacks) {
        if (other === record || !other.enabled) continue;
        for (const e of other.events) others.add(String(e.id));
      }
    }
    const result = validatePack(
      {
        format: PACK_FORMAT,
        formatVersion: 1,
        id: record.id,
        name: record.name,
        packVersion: record.packVersion,
        mode: record.mode,
        author: record.author,
        description: '',
        events: record.events,
        scenarios: [],
      },
      others,
    );
    for (const issue of result.issues) out.push(`${record.id} ${issue.path}: ${issue.message}`);
  }
  return out;
}
