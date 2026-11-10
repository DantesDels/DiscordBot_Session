/**
 * Session membership transitions: join / leave, applied to the session
 * message content (the storage — see content.ts).
 */

import {
  BANNER_PREFIX,
  FREE_SLOT,
  parseSession,
  playerLine,
} from './content';

export type SessionUpdateResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'already-joined' | 'not-joined' | 'squad-full' };

/** Replace the first free slot line with an occupied one. */
function takeFirstFreeSlot(content: string, userId: string): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.trim() === FREE_SLOT);
  lines[index] = playerLine(userId);
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
    .map((line) => (line.trim() === playerLine(userId) ? FREE_SLOT : line));
  return { ok: true, content: lines.join('\n') };
}
