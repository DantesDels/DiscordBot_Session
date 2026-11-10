import { describe, it, expect } from 'vitest';
import { addMission, removeMission, getCatalogue, CATALOG_KEY } from '../../src/missions/store';
import { findMission } from '../../src/missions/model';
import { MockKV, kv } from '../helpers';

const VALID = { name: 'Opération Brèche', role_id: '1569507016454570084', slots: 4 };

describe('catalog store', () => {
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
    // Squad sizes are restricted to 4 or 6.
    expect(await addMission(store, { ...VALID, slots: 0 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 1 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 3 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 5 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 7 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 2.5 })).toBe('invalid');
    expect(await addMission(store, { ...VALID, slots: 6 })).toBe('ok');
    expect(await getCatalogue(store)).toHaveLength(1);
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
