import type { Env } from './env';
import { verifySignature } from './discord/verify';
import { Interaction } from './discord/interaction';
import { ephemeral, ping } from './discord/responses';
import { handleAutocomplete } from './handlers/autocomplete';
import { handleCatalog } from './handlers/catalog';
import { handleComponent } from './handlers/component';
import { handleSession } from './handlers/session';

/**
 * Worker entry point — Discord HTTP Interactions Endpoint.
 *
 * 100% serverless: no gateway/WebSocket connection, so message events and
 * privileged intents are impossible by design. Everything routes through
 * this fetch handler by interaction type:
 * 1 PING, 2 APPLICATION_COMMAND, 3 MESSAGE_COMPONENT, 4 AUTOCOMPLETE.
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Interactions endpoint: only Discord POSTs are accepted.
    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    // Security: verify the Ed25519 signature before running any logic.
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    if (!signature || !timestamp) {
      return new Response('Missing signature headers', { status: 401 });
    }
    const body = await request.text();
    if (!(await verifySignature(body, signature, timestamp, env.DISCORD_PUBLIC_KEY))) {
      return new Response('Bad request signature', { status: 401 });
    }

    const interaction = JSON.parse(body) as Interaction;

    // TYPE 1: PING — required by Discord to validate the endpoint.
    if (interaction.type === 1) {
      return ping();
    }

    // TYPE 2: APPLICATION_COMMAND — slash command execution.
    if (interaction.type === 2) {
      const command = interaction.data?.name ?? '';
      if (command === 'session') {
        return await handleSession(interaction, env);
      }
      if (command === 'catalogue_ajouter' || command === 'catalogue_retirer') {
        return await handleCatalog(interaction, command, env);
      }
      return ephemeral('❌ Commande inconnue.');
    }

    // TYPE 3: MESSAGE_COMPONENT — Join / Leave buttons.
    if (interaction.type === 3) {
      return handleComponent(interaction);
    }

    // TYPE 4: APPLICATION_COMMAND_AUTOCOMPLETE.
    if (interaction.type === 4) {
      return await handleAutocomplete(interaction, env);
    }

    return new Response('Unknown interaction type', { status: 400 });
  },
};
