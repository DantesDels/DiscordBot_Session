/**
 * Mission catalog administration backed by the Cloudflare KV namespace.
 * Each mission is a KV entry whose key is the mission name.
 *
 * Note: KV writes are visible to reads immediately, but list() (and thus
 * autocomplete) is eventually consistent — a few seconds of delay is normal.
 */

export const MAX_MISSION_LENGTH = 100;

/** Add a mission to the catalog. Returns false on an invalid name. */
export async function addMission(kv: KVNamespace, mission: string): Promise<boolean> {
  const name = mission.trim();
  if (!name || name.length > MAX_MISSION_LENGTH) return false;
  await kv.put(name, '1');
  return true;
}

export async function missionExists(kv: KVNamespace, mission: string): Promise<boolean> {
  return (await kv.get(mission.trim())) !== null;
}

/** Remove a mission from the catalog. Returns false if it does not exist. */
export async function removeMission(kv: KVNamespace, mission: string): Promise<boolean> {
  const name = mission.trim();
  if (!(await missionExists(kv, name))) return false;
  await kv.delete(name);
  return true;
}
