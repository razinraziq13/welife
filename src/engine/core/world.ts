import { Rng } from './rng';
import { ageOf } from './clock';
import type {
  BiographyEntry,
  Character,
  Notification,
  NotificationCategory,
  RngStream,
  World,
} from '../state/schema';

/** Deterministic, world-scoped id: `${prefix}_${n}` in base 36. */
export function nextId(world: World, prefix: string): string {
  const id = `${prefix}_${world.nextId.toString(36)}`;
  world.nextId += 1;
  return id;
}

/** Runs `fn` with the world's RNG stream and writes the advanced state back. */
export function withRng<T>(world: World, stream: RngStream, fn: (rng: Rng) => T): T {
  const rng = new Rng(world.rng[stream]);
  const result = fn(rng);
  world.rng[stream] = rng.state();
  return result;
}

export function getCharacter(world: World, id: string): Character {
  const character = world.characters[id];
  if (!character) throw new Error(`Unknown character ${id}`);
  return character;
}

export function activeCharacter(world: World): Character {
  return getCharacter(world, world.activeCharacterId);
}

export function isAlive(character: Character): boolean {
  return character.death === null;
}

export function addBiography(
  world: World,
  characterId: string,
  category: BiographyEntry['category'],
  key: string,
  params: BiographyEntry['params'] = {},
): void {
  world.biography.push({
    id: nextId(world, 'bio'),
    tick: world.tick,
    characterId,
    category,
    key,
    params,
  });
}

export function addNotification(
  world: World,
  category: NotificationCategory,
  messageKey: string,
  params: Notification['params'],
  target: Notification['target'],
  targetId: string | null = null,
): void {
  world.notifications.push({
    id: nextId(world, 'ntf'),
    tick: world.tick,
    category,
    messageKey,
    params,
    read: false,
    target,
    targetId,
  });
}

/** Whole years of age now. */
export function ageYears(world: World, character: Character): number {
  return ageOf(character.birth, character.death ?? world.clock).years;
}

export function isPlayer(world: World, character: Character): boolean {
  return character.id === world.activeCharacterId;
}

export const RECENT_COMMAND_LIMIT = 512;

export function rememberCommand(world: World, commandId: string): void {
  world.recentCommandIds.push(commandId);
  if (world.recentCommandIds.length > RECENT_COMMAND_LIMIT) {
    world.recentCommandIds.splice(0, world.recentCommandIds.length - RECENT_COMMAND_LIMIT);
  }
}
