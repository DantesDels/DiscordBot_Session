/**
 * Shared test fixtures.
 *
 * - MockKV: in-memory KVNamespace implementing only what the bot uses.
 * - NOW / utc: fixed Paris-time reference (Tuesday, November 10, 2026,
 *   13:00 Paris = 12:00 UTC, CET/UTC+1) so date tests are deterministic.
 * - Squad-of-4 session base shared by the content/membership suites.
 */

import { buildSessionContent } from '../src/sessions/content';

/** In-memory KVNamespace mock implementing only what the bot uses. */
export class MockKV {
  private map = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export const kv = () => new MockKV() as unknown as KVNamespace;

// Fixed reference: Tuesday, November 10, 2026, 12:00 UTC = 13:00 Paris (CET, UTC+1).
export const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0));

// November 2026 Paris time is UTC+1, so Paris hh:mm = UTC (hh-1):mm.
export const utc = (day: number, hour: number, minute = 0): number =>
  Math.floor(Date.UTC(2026, 10, day, hour - 1, minute) / 1000);

export const CREATOR = '111';
export const PLAYER_A = '222';
export const PLAYER_B = '333';
export const PLAYER_C = '444';
export const ROLE_ID = '999';

// Squad of 4: creator + 3 free slots.
export const SESSION_BASE = buildSessionContent({
  unix: 1794337200,
  places: 4,
  roleId: ROLE_ID,
  creatorId: CREATOR,
});
