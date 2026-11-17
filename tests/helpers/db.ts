import { randomUUID } from 'node:crypto';
import { WeLifeDatabase } from '@persistence/db';

/** A fresh, uniquely named database so tests never share state. */
export function createTestDatabase(): WeLifeDatabase {
  return new WeLifeDatabase(`welife-test-${randomUUID()}`);
}
