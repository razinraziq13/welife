/**
 * Engine version. Bumped whenever simulation rules change in a way that could alter
 * replay results; snapshots record it so the UI can warn when replay equivalence
 * cannot be guaranteed (spec §5).
 */
export const ENGINE_VERSION = '0.9.0';

export { CONTENT_VERSION } from './content';
export { WORLD_SCHEMA_VERSION } from './state/schema';
