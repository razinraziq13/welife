import { ageYears } from '../core/world';
import type { Character, World } from '../state/schema';
import { communityHours } from './law';
import { isServing, SERVICE_HOURS } from './military';
import { politicsHours } from './politics';
import { PARTICIPATION_HOURS } from './religion';
import { inCustody } from './status';

/** Time-budget lines for civic commitments (shown in the calendar's breakdown). */
export function civicTimeLines(
  world: World,
  c: Character,
  baseHours: number,
): { key: string; hours: number }[] {
  const lines: { key: string; hours: number }[] = [];
  if (inCustody(world, c)) {
    lines.push({ key: 'time.custody', hours: -Math.max(0, baseHours - 15) });
    return lines;
  }
  if (isServing(world, c.id)) lines.push({ key: 'time.service', hours: -SERVICE_HOURS });
  const politics = politicsHours(world, c.id);
  if (politics.office > 0) lines.push({ key: 'time.office', hours: -politics.office });
  if (politics.campaign > 0) lines.push({ key: 'time.campaign', hours: -politics.campaign });
  const worship = PARTICIPATION_HOURS[c.civic.participation];
  // Children take part with their family; from 16 it is their own choice and their own time.
  if (worship > 0 && c.civic.religion !== 'none' && ageYears(world, c) >= 16)
    lines.push({ key: 'time.worship', hours: -worship });
  const community = communityHours(world, c.id);
  if (community > 0) lines.push({ key: 'time.community', hours: -community });
  return lines;
}
