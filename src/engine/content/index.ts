import { validateEventSet, type EventDefinition } from '../events/schema';
import { CORE_EVENTS } from './events/core';
import { LIFE_EVENTS } from './events/life';
import { ENTERPRISE_EVENTS } from './events/enterprise';

/**
 * Built-in content registry. Content is validated when the module loads; invalid built-in
 * content is a programming error and fails fast (and fails the test suite).
 */

/** Version of the built-in content. Bump when event rules or numbers change. */
export const CONTENT_VERSION = 'core-2026.11.3';

const validated = validateEventSet([...CORE_EVENTS, ...LIFE_EVENTS, ...ENTERPRISE_EVENTS]);
if (validated.issues.length > 0) {
  throw new Error(
    `Invalid built-in event content:\n${validated.issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`,
  );
}

export const EVENTS: readonly EventDefinition[] = [...validated.events].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
);

const BY_ID = new Map(EVENTS.map((event) => [event.id, event]));

export function findEvent(id: string): EventDefinition | undefined {
  return BY_ID.get(id);
}

export function getEvent(id: string): EventDefinition {
  const event = BY_ID.get(id);
  if (!event) throw new Error(`Unknown event ${id}`);
  return event;
}
