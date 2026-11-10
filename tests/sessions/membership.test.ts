import { describe, it, expect } from 'vitest';
import { parseSession } from '../../src/sessions/content';
import { joinSession, leaveSession } from '../../src/sessions/membership';
import { CREATOR, PLAYER_A, PLAYER_B, PLAYER_C, SESSION_BASE } from '../helpers';

describe('joinSession / leaveSession', () => {
  it('fills the first free slot in order', () => {
    const first = joinSession(SESSION_BASE, PLAYER_A);
    expect(first.ok).toBe(true);
    const view = parseSession((first as { content: string }).content);
    expect(view.players).toEqual([CREATOR, PLAYER_A]);
    expect(view.free).toBe(2);
    expect(view.full).toBe(false);
  });

  it('rejects joining twice', () => {
    const once = joinSession(SESSION_BASE, PLAYER_A) as { content: string };
    expect(joinSession(once.content, PLAYER_A)).toEqual({ ok: false, reason: 'already-joined' });
  });

  it('appends the completion banner pinging the creator (first player) when the squad fills up', () => {
    const a = (joinSession(SESSION_BASE, PLAYER_A) as { content: string }).content;
    const b = (joinSession(a, PLAYER_B) as { content: string }).content;
    const c = joinSession(b, PLAYER_C) as { content: string };
    expect(c.content).toContain('✅ **Escouade complète**');
    expect(c.content).toContain(`<@${CREATOR}> à toi de jouer`);
    expect(parseSession(c.content).full).toBe(true);
  });

  it('rejects joining a full squad', () => {
    const a = (joinSession(SESSION_BASE, PLAYER_A) as { content: string }).content;
    const b = (joinSession(a, PLAYER_B) as { content: string }).content;
    const c = (joinSession(b, PLAYER_C) as { content: string }).content;
    expect(joinSession(c, '555')).toEqual({ ok: false, reason: 'squad-full' });
  });

  it('frees the slot and removes the banner on leave', () => {
    const a = (joinSession(SESSION_BASE, PLAYER_A) as { content: string }).content;
    const b = (joinSession(a, PLAYER_B) as { content: string }).content;
    const c = (joinSession(b, PLAYER_C) as { content: string }).content;
    const left = leaveSession(c, PLAYER_A) as { content: string };
    const view = parseSession(left.content);
    expect(left.content).not.toContain('Escouade complète');
    expect(view.players).toEqual([CREATOR, PLAYER_B, PLAYER_C]);
    expect(view.free).toBe(1);
    expect(view.full).toBe(false);
  });

  it('rejects leaving when not registered', () => {
    expect(leaveSession(SESSION_BASE, PLAYER_B)).toEqual({ ok: false, reason: 'not-joined' });
  });
});
