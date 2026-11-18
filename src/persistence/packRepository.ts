import { canonicalJson } from '@engine/core/data';
import { MAX_PACK_CHARS, validatePack, type PackIssue } from '@engine/content/packs';
import type { PackSaveResult, PackSummary } from '@contracts/packs';
import type { PackRow, WeLifeDatabase } from './db';

/**
 * The device's content-pack library (spec §7). Packs are validated before they are stored;
 * an invalid file is reported with field paths and never stored, so it cannot reach a save.
 */

const HISTORY = 10;

function summarize(row: PackRow): PackSummary {
  const pack = JSON.parse(row.json) as {
    description?: string;
    events?: unknown[];
    scenarios?: { id: string; name: string; description: string }[];
  };
  return {
    id: row.id,
    name: row.name,
    packVersion: row.packVersion,
    mode: row.mode,
    author: row.author,
    description: pack.description ?? '',
    events: pack.events?.length ?? 0,
    scenarios: (pack.scenarios ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    updatedAt: row.updatedAt,
    versions: [row.packVersion, ...row.history.map((h) => h.packVersion)],
  };
}

/** Parses and validates a pack file without storing it. */
export function checkPackJson(json: string): { raw: unknown; issues: PackIssue[]; ok: boolean } {
  if (json.length > MAX_PACK_CHARS)
    return {
      raw: null,
      ok: false,
      issues: [{ path: '(file)', message: 'The file is larger than 2 MB.' }],
    };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {
      raw: null,
      ok: false,
      issues: [{ path: '(file)', message: 'This is not valid JSON.' }],
    };
  }
  const result = validatePack(raw);
  return { raw, ok: result.ok, issues: result.issues };
}

export async function listPacks(db: WeLifeDatabase): Promise<PackSummary[]> {
  const rows = await db.packs.orderBy('updatedAt').reverse().toArray();
  return rows.map(summarize);
}

export async function getPackJson(db: WeLifeDatabase, id: string): Promise<string | null> {
  return (await db.packs.get(id))?.json ?? null;
}

export async function savePack(db: WeLifeDatabase, json: string): Promise<PackSaveResult> {
  const checked = checkPackJson(json);
  if (!checked.ok) return { ok: false, issues: checked.issues, summary: null };
  const pack = checked.raw as {
    id: string;
    name: string;
    packVersion: string;
    mode: 'player' | 'developer';
    author: string;
  };
  const canonical = canonicalJson(checked.raw);
  const now = new Date().toISOString();
  const row = await db.transaction('rw', [db.packs], async () => {
    const existing = await db.packs.get(pack.id);
    const history = existing
      ? existing.json === canonical
        ? existing.history
        : [
            { packVersion: existing.packVersion, json: existing.json, savedAt: existing.updatedAt },
            ...existing.history,
          ].slice(0, HISTORY)
      : [];
    const next: PackRow = {
      id: pack.id,
      name: pack.name,
      packVersion: pack.packVersion,
      mode: pack.mode,
      author: pack.author,
      json: canonical,
      updatedAt: now,
      history,
    };
    await db.packs.put(next);
    return next;
  });
  return { ok: true, issues: [], summary: summarize(row) };
}

export async function deletePack(db: WeLifeDatabase, id: string): Promise<void> {
  await db.packs.delete(id);
}
