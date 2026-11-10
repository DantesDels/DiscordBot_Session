import { describe, it, expect } from 'vitest';
import {
  buildSessionContent,
  buildSessionComponents,
  parseSession,
  joinSession,
  leaveSession,
} from './sessionMessage';

const CREATOR = '111';
const PLAYER_A = '222';
const PLAYER_B = '333';
const PLAYER_C = '444';
const ROLE_ID = '999';

// Squad of 4: creator + 3 free slots.
const base = buildSessionContent({
  unix: 1794337200,
  places: 4,
  roleId: ROLE_ID,
  creatorId: CREATOR,
});

describe('buildSessionContent', () => {
  it('renders role ping, timestamps and slots — no mission name, no creator line', () => {
    expect(base).toContain(`<@&${ROLE_ID}> — <t:1794337200:F> (<t:1794337200:R>)`);
    expect(base).not.toContain('Créateur');
    expect(base.startsWith(`<@&${ROLE_ID}>`)).toBe(true);

    const view = parseSession(base);
    expect(view.players).toEqual([CREATOR]); // first player = creator
    expect(view.free).toBe(3); // 4 places, creator occupies one
    expect(view.slots).toBe(4);
    expect(view.full).toBe(false);
  });

  it('renders exactly the requested number of slots for a squad of 6', () => {
    const six = parseSession(
      buildSessionContent({ unix: 1, places: 6, roleId: ROLE_ID, creatorId: CREATOR })
    );
    expect(six.slots).toBe(6);
    expect(six.free).toBe(5);
    expect(six.full).toBe(false);
  });
});

describe('joinSession / leaveSession', () => {
  it('fills the first free slot in order', () => {
    const first = joinSession(base, PLAYER_A);
    expect(first.ok).toBe(true);
    const view = parseSession((first as { content: string }).content);
    expect(view.players).toEqual([CREATOR, PLAYER_A]);
    expect(view.free).toBe(2);
    expect(view.full).toBe(false);
  });

  it('rejects joining twice', () => {
    const once = joinSession(base, PLAYER_A) as { content: string };
    expect(joinSession(once.content, PLAYER_A)).toEqual({ ok: false, reason: 'already-joined' });
  });

  it('appends the completion banner pinging the creator (first player) when the squad fills up', () => {
    const a = (joinSession(base, PLAYER_A) as { content: string }).content;
    const b = (joinSession(a, PLAYER_B) as { content: string }).content;
    const c = joinSession(b, PLAYER_C) as { content: string };
    expect(c.content).toContain('✅ **Escouade complète**');
    expect(c.content).toContain(`<@${CREATOR}> à toi de jouer`);
    expect(parseSession(c.content).full).toBe(true);
  });

  it('rejects joining a full squad', () => {
    const a = (joinSession(base, PLAYER_A) as { content: string }).content;
    const b = (joinSession(a, PLAYER_B) as { content: string }).content;
    const c = (joinSession(b, PLAYER_C) as { content: string }).content;
    expect(joinSession(c, '555')).toEqual({ ok: false, reason: 'squad-full' });
  });

  it('frees the slot and removes the banner on leave', () => {
    const a = (joinSession(base, PLAYER_A) as { content: string }).content;
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
    expect(leaveSession(base, PLAYER_B)).toEqual({ ok: false, reason: 'not-joined' });
  });
});

describe('buildSessionComponents', () => {
  it('disables both buttons while the squad is full', () => {
    const enabled = buildSessionComponents(false) as Array<{
      components: Array<{ custom_id: string; disabled: boolean }>;
    }>;
    const disabled = buildSessionComponents(true) as Array<{
      components: Array<{ custom_id: string; disabled: boolean }>;
    }>;
    expect(enabled[0].components.every((c) => !c.disabled)).toBe(true);
    expect(disabled[0].components.every((c) => c.disabled)).toBe(true);
    expect(enabled[0].components.map((c) => c.custom_id)).toEqual(['session_join', 'session_leave']);
  });
});
