/**
 * Mission catalog persistence: a single Cloudflare KV entry.
 *
 * Storage: key `missions` (CATALOG_KEY) holds a JSON array of mission
 * descriptors (see model.ts). A single JSON blob keeps listing atomic — no
 * KV pagination, no eventual-consistency lag on `list()` — and writes are
 * rare (moderator commands only), so read-modify-write conflicts are not a
 * concern at this scale.
 */

import { findMission, isValidMission, MissionConfig, sameMissionName } from './model';

export const CATALOG_KEY = 'missions';

/** Read the whole catalog. Corrupted payloads degrade to an empty catalog. */
export async function getCatalogue(kv: KVNamespace): Promise<MissionConfig[]> {
  const raw = await kv.get(CATALOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is MissionConfig => isValidMission(m));
  } catch {
    return [];
  }
}

async function saveCatalogue(kv: KVNamespace, missions: MissionConfig[]): Promise<void> {
  await kv.put(CATALOG_KEY, JSON.stringify(missions));
}

/**
 * Add a mission with its role and squad size.
 * Returns 'invalid' on a bad descriptor, 'duplicate' on an existing name
 * (accent-insensitive), 'ok' otherwise.
 */
export async function addMission(
  kv: KVNamespace,
  mission: MissionConfig
): Promise<'ok' | 'invalid' | 'duplicate'> {
  if (!isValidMission(mission)) return 'invalid';
  const catalogue = await getCatalogue(kv);
  if (findMission(catalogue, mission.name)) return 'duplicate';
  catalogue.push({ ...mission, name: mission.name.trim() });
  await saveCatalogue(kv, catalogue);
  return 'ok';
}

/** Remove a mission. Returns false when it does not exist. */
export async function removeMission(kv: KVNamespace, name: string): Promise<boolean> {
  const catalogue = await getCatalogue(kv);
  const next = catalogue.filter((m) => !sameMissionName(m.name, name));
  if (next.length === catalogue.length) return false;
  await saveCatalogue(kv, next);
  return true;
}
