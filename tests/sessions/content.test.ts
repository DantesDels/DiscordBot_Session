import { describe, it, expect } from 'vitest';
import { buildSessionContent, parseSession } from '../../src/sessions/content';
import { CREATOR, ROLE_ID, SESSION_BASE } from '../helpers';

describe('buildSessionContent', () => {
  it('renders role ping, timestamps and slots — no mission name, no creator line', () => {
    expect(SESSION_BASE).toContain(`<@&${ROLE_ID}> — <t:1794337200:F> (<t:1794337200:R>)`);
    expect(SESSION_BASE).not.toContain('Créateur');
    expect(SESSION_BASE.startsWith(`<@&${ROLE_ID}>`)).toBe(true);

    const view = parseSession(SESSION_BASE);
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
