/**
 * Session message model.
 *
 * The Discord message text itself is the bot's storage (see README: no
 * database). A session message looks like:
 *
 *   <@&123> — <t:1759...:F> (<t:1759...:R>)
 *   ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
 *   ⚔️ <@456>
 *   [ Vide ]
 *
 * Conventions used by the parser:
 * - The role ping stands for the mission (no mission name in the message).
 * - A line `⚔️ <@USER_ID>` is an occupied slot. The FIRST occupied slot is
 *   the session creator.
 * - A line exactly `[ Vide ]` is a free slot.
 * - A line starting with `✅ **Escouade complète**` is the "squad full"
 *   banner, present only while the squad is complete.
 * - Squad sizes are 4 or 6 (see catalog.ts ALLOWED_SLOTS).
 */

export const FREE_SLOT = '[ Vide ]';
export const CUSTOM_ID_JOIN = 'session_join';
export const CUSTOM_ID_LEAVE = 'session_leave';

const PLAYER_LINE_RE = /^⚔️ <@(\d+)>$/;
const BANNER_PREFIX = '✅ **Escouade complète**';

export interface SessionInit {
  unix: number; // seconds
  places: number; // total squad size (creator included): 4 or 6
  roleId: string;
  creatorId: string;
}

export interface SessionView {
  players: string[]; // user ids, in slot order (players[0] is the creator)
  free: number;
  slots: number;
  full: boolean;
}

export type SessionUpdateResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'already-joined' | 'not-joined' | 'squad-full' };

/** Build the initial session message content. */
export function buildSessionContent(init: SessionInit): string {
  const header = `<@&${init.roleId}> — <t:${init.unix}:F> (<t:${init.unix}:R>)`;
  const slots: string[] = [`⚔️ <@${init.creatorId}>`];
  for (let i = 1; i < init.places; i++) slots.push(FREE_SLOT);
  return [header, '▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔', ...slots].join('\n');
}

/** Parse a session message content into its player/slot state. */
export function parseSession(content: string): SessionView {
  const players: string[] = [];
  let free = 0;
  for (const line of content.split('\n')) {
    const m = PLAYER_LINE_RE.exec(line.trim());
    if (m) players.push(m[1]);
    else if (line.trim() === FREE_SLOT) free++;
  }
  return { players, free, slots: players.length + free, full: players.length > 0 && free === 0 };
}

/** Join/Leave buttons; disabled while the squad is full. */
export function buildSessionComponents(full: boolean): unknown[] {
  return [
    {
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          style: 1, // Primary (blue)
          label: '⚔️ Rejoindre',
          custom_id: CUSTOM_ID_JOIN,
          disabled: full,
        },
        {
          type: 2,
          style: 4, // Danger (red)
          label: '❌ Quitter',
          custom_id: CUSTOM_ID_LEAVE,
          disabled: full,
        },
      ],
    },
  ];
}

/** Replace the first free slot line with an occupied one. */
function takeFirstFreeSlot(content: string, userId: string): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.trim() === FREE_SLOT);
  lines[index] = `⚔️ <@${userId}>`;
  return lines.join('\n');
}

/**
 * A player joins: fill the first free slot. When the squad becomes full,
 * the completion banner is appended (it mentions the creator — the first
 * occupied slot — which pings them for the final go-ahead, and the buttons
 * get disabled).
 */
export function joinSession(content: string, userId: string): SessionUpdateResult {
  const view = parseSession(content);
  if (view.players.includes(userId)) return { ok: false, reason: 'already-joined' };
  if (view.free === 0) return { ok: false, reason: 'squad-full' };

  let updated = takeFirstFreeSlot(content, userId);
  const joined = parseSession(updated);
  if (joined.full) {
    const creator = joined.players[0];
    updated = `${updated}\n${BANNER_PREFIX} — <@${creator ?? ''}> à toi de jouer !`;
  }
  return { ok: true, content: updated };
}

/**
 * A player leaves: free their slot again, and drop the completion banner
 * since the squad is no longer full.
 */
export function leaveSession(content: string, userId: string): SessionUpdateResult {
  const view = parseSession(content);
  if (!view.players.includes(userId)) return { ok: false, reason: 'not-joined' };

  const lines = content
    .split('\n')
    .filter((line) => !line.trim().startsWith(BANNER_PREFIX))
    .map((line) =>
      PLAYER_LINE_RE.test(line.trim()) && line.trim() === `⚔️ <@${userId}>`
        ? FREE_SLOT
        : line
    );
  return { ok: true, content: lines.join('\n') };
}
