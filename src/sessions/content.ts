/**
 * Session message format — the Discord message text itself is the bot's
 * storage (see README: no database). A session message looks like:
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
 * - Squad sizes are 4 or 6 (see missions/model.ts ALLOWED_SLOTS).
 */

export const FREE_SLOT = '[ Vide ]';
export const BANNER_PREFIX = '✅ **Escouade complète**';

const PLAYER_LINE_RE = /^⚔️ <@(\d+)>$/;
const HEADER_UNDERLINE = '▔'.repeat(20);

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

/** Render an occupied slot line for a player. */
export function playerLine(userId: string): string {
  return `⚔️ <@${userId}>`;
}

/** Build the initial session message content. */
export function buildSessionContent(init: SessionInit): string {
  const header = `<@&${init.roleId}> — <t:${init.unix}:F> (<t:${init.unix}:R>)`;
  const slots: string[] = [playerLine(init.creatorId)];
  for (let i = 1; i < init.places; i++) slots.push(FREE_SLOT);
  return [header, HEADER_UNDERLINE, ...slots].join('\n');
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
