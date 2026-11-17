import { describe, expect, it } from 'vitest';
import { RpcRequestSchema, RpcResponseSchema, formatIssues } from '@contracts/protocol';

describe('RpcRequestSchema', () => {
  it('accepts each known method', () => {
    expect(RpcRequestSchema.safeParse({ id: 'r1', method: 'system.status' }).success).toBe(true);
    expect(RpcRequestSchema.safeParse({ id: 'r2', method: 'settings.get' }).success).toBe(true);
    expect(
      RpcRequestSchema.safeParse({ id: 'r3', method: 'settings.update', params: { theme: 'dark' } })
        .success,
    ).toBe(true);
  });

  it('rejects unknown methods, missing ids and smuggled fields', () => {
    expect(RpcRequestSchema.safeParse({ id: 'r1', method: 'world.delete' }).success).toBe(false);
    expect(RpcRequestSchema.safeParse({ method: 'system.status' }).success).toBe(false);
    expect(RpcRequestSchema.safeParse({ id: '', method: 'system.status' }).success).toBe(false);
    expect(
      RpcRequestSchema.safeParse({ id: 'r1', method: 'settings.get', params: { theme: 'dark' } })
        .success,
    ).toBe(false);
  });

  it('reports validation issues with dotted field paths', () => {
    const result = RpcRequestSchema.safeParse({
      id: 'r1',
      method: 'settings.update',
      params: { textScale: 7 },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatIssues(result.error).map((i) => i.path)).toContain('params.textScale');
  });
});

describe('RpcResponseSchema', () => {
  it('accepts success and error responses', () => {
    expect(RpcResponseSchema.safeParse({ id: 'r1', ok: true, result: 1 }).success).toBe(true);
    expect(
      RpcResponseSchema.safeParse({
        id: null,
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'bad' },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown error codes', () => {
    expect(
      RpcResponseSchema.safeParse({ id: 'r1', ok: false, error: { code: 'NOPE', message: 'x' } })
        .success,
    ).toBe(false);
  });
});
