import { clamp } from '../core/data';
import { applyPercent } from '../core/money';
import { nextId, withRng } from '../core/world';
import { changeHabit, changeNeed, changeSkill, changeStat } from '../characters/stats';
import { resolveInterview } from '../career/jobs';
import { medianWage } from '../economy/economy';
import { payExpense, payMedicalCost, payerFor, receiveIncome } from '../economy/finance';
import { addMemory } from '../social/memories';
import { adjustPair, linkPair } from '../social/relationships';
import type { Character, World } from '../state/schema';
import type { Effect } from './schema';

/** Who and what an event instance is about. */
export interface EffectContext {
  subjectId: string | null;
  context: Record<string, string | number>;
}

const NO_CONTEXT: EffectContext = { subjectId: null, context: {} };

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
  ctx: EffectContext = NO_CONTEXT,
): void {
  const subject = ctx.subjectId ? world.characters[ctx.subjectId] : undefined;
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
        if (effect.with === 'parents' || effect.with === 'siblings') {
          adjustFamilyCloseness(world, character, effect.with, effect.closeness);
        } else if (effect.with === 'partner' && character.partnership) {
          adjustPair(world, character.id, character.partnership.partnerId, {
            closeness: effect.closeness,
          });
        } else if (effect.with === 'friends') {
          for (const rel of Object.values(world.relationships)) {
            if (rel.aId === character.id && rel.type === 'friend')
              adjustPair(world, character.id, rel.bId, { closeness: effect.closeness });
          }
        }
        break;
      case 'subjectRelationship':
        if (subject) {
          adjustPair(world, character.id, subject.id, {
            closeness: effect.closeness,
            trust: effect.trust,
            respect: effect.respect,
            conflict: effect.conflict,
          });
        }
        break;
      case 'subjectFriend':
        if (subject?.death === null)
          linkPair(world, character, subject, 'friend', 'friend', { closeness: 50 });
        break;
      case 'memory':
        if (subject) {
          const owner = effect.owner === 'subject' ? subject : character;
          const about = effect.owner === 'subject' ? character : subject;
          addMemory(world, {
            ownerId: owner.id,
            subjectIds: [about.id],
            key: effect.key,
            source: sourceInstanceId ?? cause,
            valence: effect.valence,
            salience: effect.salience,
            decay: effect.decay,
          });
        }
        break;
      case 'money': {
        const amount = applyPercent(
          medianWage(world, character.countryCode),
          Math.abs(effect.percent),
        );
        const payer = payerFor(world, character);
        if (!payer || amount === 0n) break;
        if (effect.percent > 0)
          receiveIncome(
            world,
            payer.ownerId,
            payer.checkingId,
            effect.category,
            amount,
            'tx.event',
            { cause },
          );
        else
          payExpense(
            world,
            payer,
            effect.category,
            amount,
            'tx.event',
            { cause },
            sourceInstanceId,
          );
        break;
      }
      case 'medical':
        payMedicalCost(
          world,
          character,
          applyPercent(medianWage(world, character.countryCode), effect.percent),
          sourceInstanceId ?? cause,
        );
        break;
      case 'grade':
        if (character.education.current) {
          character.education.current.grade = clamp(
            character.education.current.grade + effect.delta,
            0,
            1000,
          );
        }
        break;
      case 'performance': {
        const job = character.employmentId ? world.employment[character.employmentId] : undefined;
        if (job?.status === 'active')
          job.performance = clamp(job.performance + effect.delta, 0, 1000);
        break;
      }
      case 'action': {
        const [kind, style] = effect.action.split('.');
        const applicationId = ctx.context.applicationId;
        if (kind === 'interview' && typeof applicationId === 'string' && style)
          resolveInterview(world, applicationId, style);
        break;
      }
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
            subjectId: effect.keepSubject ? ctx.subjectId : null,
            context: {},
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
