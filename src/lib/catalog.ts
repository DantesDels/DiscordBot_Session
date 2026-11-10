/**
 * Mission catalog backed by a single Cloudflare KV entry.
 *
 * Storage: key `missions` holds a JSON array of mission descriptors:
 *   [{ "name": "Arbitrage", "role_id": "1569507...", "slots": 4 }, ...]
 *
 * - `name`: display name used in autocomplete and the session message.
 * - `role_id`: Discord role snowflake pinged when a session of this mission
 *   is created (the session response must allow the role in
 *   `allowed_mentions`, otherwise Discord silently drops the ping).
 * - `slots`: recommended squad size (1-6), shown as the starred choice in
 *   the `places` autocomplete. The creator can still pick any value.
 *
 * A single JSON blob keeps listing atomic (no KV pagination, no eventual
 * consistency lag on `list()`) — writes are rare (moderator commands only),
 * so read-modify-write conflicts are not a concern at this scale.
 */

export const CATALOG_KEY = 'missions';
export const MAX_MISSION_LENGTH = 100;
export const MAX_SLOTS = 6;

export interface MissionConfig {
  name: string;
  role_id: string;
  slots: number;
}

const SNOWFLAKE_RE = /^\d{17,20}$/;

/** Lowercase and strip diacritics so "Breach" matches "Brèche". */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isValidMission(mission: MissionConfig): boolean {
  return (
    typeof mission.name === 'string' &&
    mission.name.trim().length > 0 &&
    mission.name.length <= MAX_MISSION_LENGTH &&
    SNOWFLAKE_RE.test(mission.role_id) &&
    Number.isInteger(mission.slots) &&
    mission.slots >= 1 &&
    mission.slots <= MAX_SLOTS
  );
}

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

/** Exact match first, then accent/case-insensitive match (hand-typed input). */
export function findMission(catalogue: MissionConfig[], name: string): MissionConfig | undefined {
  const trimmed = name.trim();
  const exact = catalogue.find((m) => m.name === trimmed);
  if (exact) return exact;
  const target = normalize(trimmed);
  return catalogue.find((m) => normalize(m.name) === target);
}

/**
 * Add a mission with its role and recommended slots.
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
  const trimmed = name.trim();
  const next = catalogue.filter(
    (m) => m.name !== trimmed && normalize(m.name) !== normalize(trimmed)
  );
  if (next.length === catalogue.length) return false;
  await saveCatalogue(kv, next);
  return true;
}
