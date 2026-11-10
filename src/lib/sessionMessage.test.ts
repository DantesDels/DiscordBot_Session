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

const base = buildSessionContent({
  mission: 'Opération Brèche',
  unix: 1794337200,
  places: 3,
  roleId: '999',
  creatorId: CREATOR,
});

describe('buildSessionContent', () => {
  it('renders role ping, timestamps, creator and the right number of slots', () => {
    expect(base).toContain('<@&999> **Opération Brèche**');
    expect(base).toContain('<t:1794337200:F> (<t:1794337200:R>)');
    expect(base).toContain(`👤 Créateur : <@${CREATOR}>`);

    const view = parseSession(base);
    expect(view.players).toEqual([CREATOR]);
    expect(view.free).toBe(2); // 3 places, creator occupies one
    expect(view.slots).toBe(3);
    expect(view.full).toBe(false);
  });

  it('omits the role ping when no role is given', () => {
    const noRole = buildSessionContent({
      mission: 'M',
      unix: 1,
      places: 2,
      creatorId: CREATOR,
    });
    expect(noRole.startsWith('**M**')).toBe(true);
  });

  it('marks a single-place squad as full immediately', () => {
    const solo = parseSession(
      buildSessionContent({ mission: 'M', unix: 1, places: 1, creatorId: CREATOR })
    );
    expect(solo.free).toBe(0);
    expect(solo.full).toBe(true);
  });
});

describe('joinSession / leaveSession', () => {
  it('fills the first free slot in order', () => {
    const first = joinSession(base, PLAYER_A);
    expect(first.ok).toBe(true);
    const view = parseSession((first as { content: string }).content);
    expect(view.players).toEqual([CREATOR, PLAYER_A]);
    expect(view.free).toBe(1);
    expect(view.full).toBe(false);
  });

  it('rejects joining twice', () => {
    const once = joinSession(base, PLAYER_A) as { content: string };
    expect(joinSession(once.content, PLAYER_A)).toEqual({ ok: false, reason: 'already-joined' });
  });

  it('appends the completion banner mentioning the creator when the squad fills up', () => {
    const a = (joinSession(base, PLAYER_A) as { content: string }).content;
    const b = joinSession(a, PLAYER_B) as { content: string };
    expect(b.content).toContain('✅ **Escouade complète**');
    expect(b.content).toContain(`<@${CREATOR}> à toi de jouer`);
    expect(parseSession(b.content).full).toBe(true);
  });

  it('rejects joining a full squad', () => {
    const a = (joinSession(base, PLAYER_A) as { content: string }).content;
    const b = (joinSession(a, PLAYER_B) as { content: string }).content;
    expect(joinSession(b, '444')).toEqual({ ok: false, reason: 'squad-full' });
  });

  it('frees the slot and removes the banner on leave', () => {
    const a = (joinSession(base, PLAYER_A) as { content: string }).content;
    const b = (joinSession(a, PLAYER_B) as { content: string }).content;
    const left = leaveSession(b, PLAYER_A) as { content: string };
    const view = parseSession(left.content);
    expect(left.content).not.toContain('Escouade complète');
    expect(view.players).toEqual([CREATOR, PLAYER_B]);
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
