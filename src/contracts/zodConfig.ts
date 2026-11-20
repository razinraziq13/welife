import { z } from 'zod';

/**
 * Imported first by the worker entry, before any schema is built (zod builds its fast path
 * when a schema is created). Our CSP forbids eval; without this zod probes `new Function`.
 * The page sets the same flag in index.html, before any module loads.
 */
z.config({ jitless: true });
