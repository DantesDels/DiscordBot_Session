/**
 * Mission catalog domain model.
 *
 * A mission descriptor:
 * - `name`: display name used in autocomplete and the session message.
 * - `role_id`: Discord role snowflake pinged when a session of this mission
 *   is created (the session response must allow the role in
 *   `allowed_mentions`, otherwise Discord silently drops the ping).
 * - `slots`: squad size (4 or 6, see ALLOWED_SLOTS), driven by the mission
 *   itself — `/session` has no `places` option.
 */

export const MAX_MISSION_LENGTH = 100;
/** Squad sizes offered for sessions: 4 or 6 players (no solo, no odd sizes). */
export const ALLOWED_SLOTS = [4, 6] as const;

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

/** Whether a mission descriptor can be stored in the catalog. */
export function isValidMission(mission: MissionConfig): boolean {
  return (
    typeof mission.name === 'string' &&
    mission.name.trim().length > 0 &&
    mission.name.length <= MAX_MISSION_LENGTH &&
    SNOWFLAKE_RE.test(mission.role_id) &&
    (ALLOWED_SLOTS as readonly number[]).includes(mission.slots)
  );
}

/** Exact or accent/case-insensitive name equality. */
export function sameMissionName(a: string, b: string): boolean {
  const ta = a.trim();
  const tb = b.trim();
  return ta === tb || normalize(ta) === normalize(tb);
}

/** Find a mission by name: exact match first, then accent-insensitive. */
export function findMission(
  catalogue: MissionConfig[],
  name: string
): MissionConfig | undefined {
  const trimmed = name.trim();
  const exact = catalogue.find((m) => m.name === trimmed);
  if (exact) return exact;
  const target = normalize(trimmed);
  return catalogue.find((m) => normalize(m.name) === target);
}
