import { AutocompleteChoice } from './choices';
import { buildSessionComponents } from '../sessions/components';

/** Serialize a Discord interaction response payload. */
function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** PING acknowledgement (type 1) — required to validate the endpoint. */
export function ping(): Response {
  return json({ type: 1 });
}

/** Private reply for errors and permission denials (flags: 64 = ephemeral). */
export function ephemeral(content: string): Response {
  return json({ type: 4, data: { content, flags: 64 } });
}

/** Visible-to-everyone reply that also renders the join/leave buttons. */
export function sessionMessage(content: string, full: boolean, roleId?: string): Response {
  // Role pings in bot messages are silently dropped by Discord unless the
  // role is explicitly allowed here.
  const allowed_mentions = roleId ? { roles: [roleId] } : undefined;
  return json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: { content, components: buildSessionComponents(full), allowed_mentions },
  });
}

/** Edit the original session message in place. */
export function updateMessage(content: string, full: boolean): Response {
  return json({
    type: 7, // UPDATE_MESSAGE
    data: { content, components: buildSessionComponents(full) },
  });
}

/** Autocomplete result (type 8). */
export function autocomplete(choices: AutocompleteChoice[]): Response {
  return json({ type: 8, data: { choices } });
}
