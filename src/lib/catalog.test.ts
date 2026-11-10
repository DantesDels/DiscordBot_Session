import { describe, it, expect } from 'vitest';
import { addMission, removeMission, missionExists, MAX_MISSION_LENGTH } from './catalog';
import { missionChoices } from './missionAutocomplete';

/** In-memory KVNamespace mock implementing only what the bot uses. */
class MockKV {
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

  async list(options?: { cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    const limit = options?.limit ?? 1000;
    const start = options?.cursor ? Number(options.cursor) : 0;
    const names = [...this.map.keys()].sort();
    const page = names.slice(start, start + limit);
    const end = start + page.length;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: end >= names.length,
      cursor: end < names.length ? String(end) : undefined,
    };
  }
}

const kv = () => new MockKV() as unknown as KVNamespace;

describe('catalog', () => {
  it('adds and finds missions', async () => {
    const store = kv();
    expect(await addMission(store, 'Opération Brèche')).toBe(true);
    expect(await missionExists(store, 'Opération Brèche')).toBe(true);
    expect(await missionExists(store, 'Autre')).toBe(false);
  });

  it('rejects empty or oversized mission names', async () => {
    const store = kv();
    expect(await addMission(store, '   ')).toBe(false);
    expect(await addMission(store, 'x'.repeat(MAX_MISSION_LENGTH + 1))).toBe(false);
  });

  it('removes existing missions only', async () => {
    const store = kv();
    await addMission(store, 'Raid nocturne');
    expect(await removeMission(store, 'Raid nocturne')).toBe(true);
    expect(await removeMission(store, 'Raid nocturne')).toBe(false);
    expect(await missionExists(store, 'Raid nocturne')).toBe(false);
  });
});

describe('missionChoices with the catalog', () => {
  it('matches accents-insensitively and ranks prefixes first', async () => {
    const store = kv();
    await addMission(store, 'Opération Brèche');
    await addMission(store, 'Opération Nuit');
    await addMission(store, 'Embuscade');

    const choices = await missionChoices(store, 'operation');
    expect(choices.map((c) => c.value)).toEqual([
      'Opération Brèche',
      'Opération Nuit',
    ]);

    const accentChoices = await missionChoices(store, 'opération br');
    expect(accentChoices.map((c) => c.value)).toEqual(['Opération Brèche']);

    const all = await missionChoices(store, '');
    expect(all.map((c) => c.value)).toEqual(['Embuscade', 'Opération Brèche', 'Opération Nuit']);
  });
});
