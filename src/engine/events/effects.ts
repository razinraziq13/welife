import { clamp } from '../core/data';
import { nextId, withRng } from '../core/world';
import { changeHabit, changeNeed, changeSkill, changeStat } from '../characters/stats';
import type { Character, World } from '../state/schema';
import type { Effect } from './schema';

/**
 * Applies declarative effects to a character. Called exactly once per resolved event
 * instance (the runtime marks instances resolved in the same step), so effects are never
 * applied twice.
 */
export function applyEffects(
  world: World,
  character: Character,
  effects: readonly Effect[],
  cause: string,
  sourceInstanceId: string | null,
): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case 'stat':
        changeStat(world, character, effect.key, effect.delta, cause);
        break;
      case 'need':
        changeNeed(character, effect.key, effect.delta);
        break;
      case 'skill':
        changeSkill(world, character, effect.key, effect.delta, cause);
        break;
      case 'habit':
        changeHabit(character, effect.key, effect.delta);
        break;
      case 'flag':
        character.flags[effect.flag] = effect.value;
        break;
      case 'relationship':
        adjustFamilyCloseness(world, character, effect.with, effect.closeness);
        break;
      case 'schedule': {
        if (sourceInstanceId === null) break;
        const fires = withRng(world, 'events', (rng) => rng.int(100) < effect.chancePercent);
        if (fires) {
          world.events.scheduled.push({
            id: nextId(world, 'csq'),
            sourceInstanceId,
            eventId: effect.eventId,
            characterId: character.id,
            dueTick: world.tick + effect.inMonths,
          });
        }
        break;
      }
    }
  }
}

/** Changes closeness on both directions of the character's parent or sibling relationships. */
export function adjustFamilyCloseness(
  world: World,
  character: Character,
  who: 'parents' | 'siblings',
  delta: number,
): void {
  const type = who === 'parents' ? 'parent' : 'sibling';
  const relatives = new Set<string>();
  for (const rel of Object.values(world.relationships)) {
    if (rel.aId === character.id && rel.type === type) relatives.add(rel.bId);
  }
  for (const rel of Object.values(world.relationships)) {
    const forward = rel.aId === character.id && relatives.has(rel.bId);
    const backward = rel.bId === character.id && relatives.has(rel.aId);
    if (forward || backward) {
      rel.closeness = clamp(rel.closeness + delta, 0, 100);
      rel.lastContactTick = world.tick;
    }
  }
}
