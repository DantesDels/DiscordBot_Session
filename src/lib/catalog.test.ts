import { describe, it, expect } from 'vitest';
import {
  addMission,
  removeMission,
  findMission,
  getCatalogue,
  CATALOG_KEY,
} from './catalog';
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
}

const kv = () => new MockKV() as unknown as KVNamespace;

const VALID = { name: 'Opération Brèche', role_id: '1569507016454570084', slots: 4 };

describe('catalog', () => {
  it('adds a mission and finds it (exact then accent/case-insensitive)', async () => {
    const store = kv();
    expect(await addMission(store, VALID)).toBe('ok');

    const catalogue = await getCatalogue(store);
    expect(catalogue).toHaveLength(1);
    expect(findMission(catalogue, 'Opération Brèche')).toEqual(VALID);
    expect(findMission(catalogue, 'operation breche')).toEqual(VALID);
    expect(findMission(catalogue, 'Autre')).toBeUndefined();
  });

  it('rejects invalid descriptors', async () => {
    const store = kv();
    expect(await addMission(store, { ...VALID, name: '   ' })).toBe('invalid');
    expect(await addMission(store, { ...VALID, name: 'x'.repeat(101) })).toBe('invalid');
    expect(await addMission(store, { ...VALID, role_id: '123' })).toBe('invalid'); // not a snowflake
    expect(await addMission(store, { ...VALID, role_id: 'role' })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 0 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 7 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 2.5 })).toBe('invalid');
    expect(await getCatalogue(store)).toEqual([]);
  });

  it('rejects duplicates (accent-insensitive)', async () => {
    const store = kv();
    await addMission(store, VALID);
    expect(await addMission(store, { ...VALID, name: 'operation breche' })).toBe('duplicate');
    expect(await addMission(store, { ...VALID, name: 'OPERATION BRECHE' })).toBe('duplicate');
    expect(await addMission(store, { ...VALID, name: 'Autre mission' })).toBe('ok');
    expect((await getCatalogue(store)).length).toBe(2);
  });

  it('removes missions (accent-insensitive) and reports misses', async () => {
    const store = kv();
    await addMission(store, VALID);
    expect(await removeMission(store, 'opération brèche')).toBe(true);
    expect(await removeMission(store, 'Opération Brèche')).toBe(false);
    expect(await getCatalogue(store)).toEqual([]);
  });

  it('degrades corrupted KV payloads to an empty catalog', async () => {
    const store = kv();
    await (store as unknown as MockKV).put(CATALOG_KEY, 'not json {');
    expect(await getCatalogue(store)).toEqual([]);
    await (store as unknown as MockKV).put(CATALOG_KEY, JSON.stringify({ no: 'array' }));
    expect(await getCatalogue(store)).toEqual([]);
    // Invalid entries are filtered out, valid ones kept.
    await (store as unknown as MockKV).put(
      CATALOG_KEY,
      JSON.stringify([VALID, { name: 'Bad', role_id: 'x', slots: 9 }])
    );
    expect(await getCatalogue(store)).toEqual([VALID]);
  });
});

describe('missionChoices with the catalog', () => {
  it('matches accents-insensitively and ranks prefixes first', async () => {
    const store = kv();
    await addMission(store, { name: 'Opération Brèche', role_id: '1'.repeat(19), slots: 4 });
    await addMission(store, { name: 'Opération Nuit', role_id: '1'.repeat(19), slots: 5 });
    await addMission(store, { name: 'Embuscade', role_id: '1'.repeat(19), slots: 3 });

    const choices = await missionChoices(store, 'operation');
    expect(choices.map((c) => c.value)).toEqual(['Opération Brèche', 'Opération Nuit']);

    const accentChoices = await missionChoices(store, 'opération br');
    expect(accentChoices.map((c) => c.value)).toEqual(['Opération Brèche']);

    const all = await missionChoices(store, '');
    // The JSON blob keeps insertion order (no KV list() sorting anymore).
    expect(all.map((c) => c.value)).toEqual(['Opération Brèche', 'Opération Nuit', 'Embuscade']);
  });
});
