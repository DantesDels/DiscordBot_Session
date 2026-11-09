import { verifyKey } from 'discord-interactions';

// Define the environment variables binding (Cloudflare settings)
export interface Env {
  DISCORD_PUBLIC_KEY: string;
  // TODO: Add KV Namespace binding later
  // CATALOGUE_KV: KVNamespace; 
}

export default {
  /**
   * Main fetch handler for the Cloudflare Worker
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Only accept POST requests from Discord
    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    // 2. Extract security headers
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    
    if (!signature || !timestamp) {
      return new Response('Missing signature headers', { status: 401 });
    }

    // 3. Read the request body as raw text for validation
    const body = await request.text();

    // 4. Validate the cryptographic signature
    const isValidRequest = verifyKey(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
      return new Response('Bad request signature', { status: 401 });
    }

    // 5. Parse the validated body as JSON
    const interaction = JSON.parse(body);

    // =====================================================================
    // ROUTER: Handle Discord Interactions by Type
    // =====================================================================

    // TYPE 1: PING (Required by Discord to verify the endpoint)
    if (interaction.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // TYPE 2: APPLICATION_COMMAND (Slash Commands Execution)
    if (interaction.type === 2) {
      if (interaction.data?.name === 'session') {
        // TODO: Extract options, generate timestamps, build message, attach buttons
        return new Response(JSON.stringify({
          type: 4, // Type 4: ChannelMessageWithSource
          data: { 
            content: 'Placeholder for the session message.',
            flags: 64 // Ephemeral flag for now
          }
        }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TYPE 3: MESSAGE_COMPONENT (Buttons: Join / Leave)
    if (interaction.type === 3) {
      // TODO: Parse message content, update slots, check if full, return type 7 (UPDATE_MESSAGE)
    }

    // TYPE 4: APPLICATION_COMMAND_AUTOCOMPLETE
    if (interaction.type === 4) {
      if (interaction.data?.name === 'session') {
        // TODO: Handle Autocomplete for 'mission', 'places', and 'date_heure'
        return new Response(JSON.stringify({
          type: 8, // Type 8: ApplicationCommandAutocompleteResult
          data: { choices: [] }
        }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Fallback for unknown interaction types
    return new Response('Unknown interaction type', { status: 400 });
  },
};