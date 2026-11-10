import { describe, it, expect } from 'vitest';
import { buildSessionContent, parseSession } from './content';

const CREATOR = '111';
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
