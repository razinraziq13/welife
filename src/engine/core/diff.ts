import { canonicalJson, deepClone, isPlainObject, type PlainObject } from './data';

/**
 * Structural diff/patch for world snapshots (spec §5: periodic full snapshots plus deltas).
 * Append-only arrays (biography, notifications) are stored as `append` operations, so a
 * monthly delta stays small even as the life story grows.
 */
export type PatchOp =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'del'; path: string[] }
  | { op: 'append'; path: string[]; values: unknown[] };

export function diff(before: unknown, after: unknown): PatchOp[] {
  const ops: PatchOp[] = [];
  diffInto(before, after, [], ops);
  return ops;
}

function diffInto(a: unknown, b: unknown, path: string[], ops: PatchOp[]): void {
  if (a === b) return;
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
      if (!(key in b) || b[key] === undefined) {
        if (key in a && a[key] !== undefined) ops.push({ op: 'del', path: [...path, key] });
      } else if (!(key in a) || a[key] === undefined) {
        ops.push({ op: 'set', path: [...path, key], value: deepClone(b[key]) });
      } else {
        diffInto(a[key], b[key], [...path, key], ops);
      }
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const before = canonicalJson(a);
    if (b.length >= a.length && canonicalJson(b.slice(0, a.length)) === before) {
      if (b.length > a.length) {
        ops.push({ op: 'append', path, values: deepClone(b.slice(a.length)) });
      }
      return;
    }
    if (canonicalJson(b) !== before) ops.push({ op: 'set', path, value: deepClone(b) });
    return;
  }
  if (canonicalJson(a) !== canonicalJson(b)) ops.push({ op: 'set', path, value: deepClone(b) });
}

/** Applies a patch to a copy of `base` and returns the result (`base` is not modified). */
export function applyPatch<T>(base: T, ops: readonly PatchOp[]): T {
  let root: unknown = deepClone(base);
  for (const op of ops) {
    if (op.path.length === 0) {
      if (op.op === 'set') root = deepClone(op.value);
      else if (op.op === 'append') {
        if (!Array.isArray(root)) throw new Error('applyPatch: append target is not an array');
        root = [...(root as unknown[]), ...deepClone(op.values)];
      } else throw new Error('applyPatch: cannot delete the root');
      continue;
    }
    const parent = resolveParent(root, op.path);
    const key = op.path[op.path.length - 1] as string;
    if (op.op === 'set') parent[key] = deepClone(op.value);
    else if (op.op === 'del') Reflect.deleteProperty(parent, key);
    else {
      const target = parent[key];
      if (!Array.isArray(target))
        throw new Error(`applyPatch: ${op.path.join('.')} is not an array`);
      target.push(...deepClone(op.values));
    }
  }
  return root as T;
}

function resolveParent(root: unknown, path: readonly string[]): PlainObject {
  let node: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isPlainObject(node))
      throw new Error(`applyPatch: missing parent at ${path.slice(0, i + 1).join('.')}`);
    node = node[path[i] as string];
  }
  if (!isPlainObject(node)) throw new Error(`applyPatch: missing parent for ${path.join('.')}`);
  return node;
}
