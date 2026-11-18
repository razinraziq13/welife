import type { World } from '../state/schema';
import { processHealth } from './health';
import { processLaw } from './law';
import { processApplications, processResidence } from './migration';
import { processService } from './military';
import { processPolitics } from './politics';
import { processReligion } from './religion';
import { processRoyal } from './royal';

/**
 * Milestone 6 monthly processing, called from the tick in the spec's order:
 * step 4 pays and runs civic duties (service, office, royal allowance, church tax),
 * step 6 updates health, step 8 handles migration and legal states.
 */
export function processCivicDuties(world: World): void {
  processService(world);
  processPolitics(world);
  processRoyal(world);
  processReligion(world);
}

export function processCivicHealth(world: World): void {
  processHealth(world);
}

export function processInstitutions(world: World): void {
  processApplications(world);
  processResidence(world);
  processLaw(world);
}
