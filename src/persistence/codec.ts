import { canonicalJson, parseCanonicalJson } from '@engine/core/data';

/**
 * Binary encoding for stored state: canonical JSON, gzip-compressed with the platform
 * CompressionStream (no dependency), plus SHA-256 integrity hashes (spec §5).
 *
 * These functions are async and must be awaited BEFORE opening a Dexie transaction:
 * awaiting non-IndexedDB promises inside a transaction would let it auto-commit early.
 */

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  // A plain ReadableStream (not a Blob): WebKit backs Blob streams with blob: URLs and logs
  // errors when a page unloads while one is being read.
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes)); // copy into a plain ArrayBuffer
      controller.close();
    },
  });
  const response = new Response(input.pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream('gzip'));
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream('gzip'));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash of a value's canonical JSON (stable across key order and platforms). */
export async function hashValue(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export async function encodeValue(value: unknown): Promise<{ bytes: Uint8Array; hash: string }> {
  const text = canonicalJson(value);
  const [bytes, hash] = await Promise.all([gzip(encoder.encode(text)), sha256Hex(text)]);
  return { bytes, hash };
}

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}

export async function decodeValue(bytes: Uint8Array): Promise<unknown> {
  try {
    return parseCanonicalJson(decoder.decode(await gunzip(bytes)));
  } catch (error) {
    throw new IntegrityError(
      `Stored data could not be read (${error instanceof Error ? error.message : 'unknown'}).`,
    );
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
