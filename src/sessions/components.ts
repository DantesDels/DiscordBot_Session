/**
 * Session message UI: the Join / Leave button row. `full` disables both
 * buttons while the squad is complete.
 */

export const CUSTOM_ID_JOIN = 'session_join';
export const CUSTOM_ID_LEAVE = 'session_leave';

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
