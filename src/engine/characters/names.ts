import type { Identity } from '../state/schema';

/** Full display name honouring the name order of the character's culture, plus any title. */
export function displayName(identity: Identity, withTitle = true): string {
  const parts =
    identity.nameOrder === 'family-first'
      ? [identity.lastName, identity.firstName]
      : [identity.firstName, identity.lastName];
  const name = parts.filter((part) => part.length > 0).join(' ');
  return withTitle && identity.title ? `${identity.title} ${name}` : name;
}

export function shortName(identity: Identity): string {
  return identity.firstName;
}
