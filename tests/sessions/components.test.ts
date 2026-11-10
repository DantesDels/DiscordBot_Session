import { describe, it, expect } from 'vitest';
import {
  buildSessionComponents,
  CUSTOM_ID_JOIN,
  CUSTOM_ID_LEAVE,
} from '../../src/sessions/components';

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
    expect(enabled[0].components.map((c) => c.custom_id)).toEqual([CUSTOM_ID_JOIN, CUSTOM_ID_LEAVE]);
  });
});
