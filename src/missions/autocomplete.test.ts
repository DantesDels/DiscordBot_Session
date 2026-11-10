import { describe, it, expect } from 'vitest';
import { missionChoices } from './autocomplete';
import { addMission } from './store';

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

describe('missionChoices with the catalog', () => {
  it('matches accents-insensitively and ranks prefixes first', async () => {
    const store = kv();
    await addMission(store, { name: 'Opération Brèche', role_id: '1'.repeat(19), slots: 4 });
    await addMission(store, { name: 'Opération Nuit', role_id: '1'.repeat(19), slots: 6 });
    await addMission(store, { name: 'Embuscade', role_id: '1'.repeat(19), slots: 4 });

    const choices = await missionChoices(store, 'operation');
    expect(choices.map((c) => c.value)).toEqual(['Opération Brèche', 'Opération Nuit']);

    const accentChoices = await missionChoices(store, 'opération br');
    expect(accentChoices.map((c) => c.value)).toEqual(['Opération Brèche']);

    const all = await missionChoices(store, '');
    // The JSON blob keeps insertion order (no KV list() sorting anymore).
    expect(all.map((c) => c.value)).toEqual(['Opération Brèche', 'Opération Nuit', 'Embuscade']);
  });
});
