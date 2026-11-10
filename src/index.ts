import { verifyKey } from 'discord-interactions';
import {
  daySuggestions,
  parseDayTime,
  timeSuggestions,
} from './lib/parseDate';
import {
  buildSessionComponents,
  buildSessionContent,
  CUSTOM_ID_JOIN,
  CUSTOM_ID_LEAVE,
  joinSession,
  leaveSession,
  parseSession,
} from './lib/sessionMessage';
import { missionChoices } from './lib/missionAutocomplete';
import {
  addMission,
  ALLOWED_SLOTS,
  findMission,
  getCatalogue,
  MAX_MISSION_LENGTH,
  removeMission,
} from './lib/catalog';

// Cloudflare bindings (see wrangler.toml).
export interface Env {
  DISCORD_PUBLIC_KEY: string;
  CATALOGUE_KV: KVNamespace;
}

/** ------------------------------------------------------------------ *
 *  Discord interaction payloads (only the fields this bot reads).
 *  ------------------------------------------------------------------ */

interface InteractionOption {
  name: string;
  value?: string | number;
  focused?: boolean;
}

interface Interaction {
  type: number;
  data?: {
    name: string;
    options?: InteractionOption[];
    custom_id?: string;
  };
  member?: { user?: { id: string } };
  user?: { id: string };
  message?: { content: string };
}

/** ------------------------------------------------------------------ *
 *  Small helpers
 *  ------------------------------------------------------------------ */

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Visible-to-everyone reply that also renders the join/leave buttons. */
function sessionMessage(content: string, full: boolean, roleId?: string): Response {
  // Role pings in bot messages are silently dropped by Discord unless the
  // role is explicitly allowed here.
  const allowed_mentions = roleId ? { roles: [roleId] } : undefined;
  return json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: { content, components: buildSessionComponents(full), allowed_mentions },
  });
}

/** Private reply for errors and permission denials (flags: 64 = ephemeral). */
function ephemeral(content: string): Response {
  return json({ type: 4, data: { content, flags: 64 } });
}

/** Edit the original session message in place. */
function updateMessage(content: string, full: boolean): Response {
  return json({
    type: 7, // UPDATE_MESSAGE
    data: { content, components: buildSessionComponents(full) },
  });
}

function options(interaction: Interaction): Map<string, string | number | undefined> {
  const map = new Map<string, string | number | undefined>();
  for (const option of interaction.data?.options ?? []) {
    map.set(option.name, option.value);
  }
  return map;
}

function focusedOption(interaction: Interaction): InteractionOption | undefined {
  return interaction.data?.options?.find((o) => o.focused);
}

function userId(interaction: Interaction): string | undefined {
  return interaction.member?.user?.id ?? interaction.user?.id;
}

/** ------------------------------------------------------------------ *
 *  Slash commands
 *  ------------------------------------------------------------------ */

/** `/session mission:<catalogue> jour:<day> heure:<slot>` — role AND squad size come from the catalog. */
async function handleSession(interaction: Interaction, env: Env): Promise<Response> {
  const opts = options(interaction);

  // Mission must exist in the catalog: it carries the role to ping and the
  // squad size. Zero manual input = zero typos. getCatalogue() guarantees
  // mission.slots is a valid size (ALLOWED_SLOTS).
  const missionName = String(opts.get('mission') ?? '').trim();
  const catalogue = await getCatalogue(env.CATALOGUE_KV);
  const mission = findMission(catalogue, missionName);
  if (!mission) {
    return ephemeral('❌ Mission introuvable dans le catalogue. Choisis-la via l’autocomplétion.');
  }
  const places = mission.slots;

  const jour = String(opts.get('jour') ?? '').trim();
  const heure = String(opts.get('heure') ?? '').trim();
  const unix = parseDayTime(jour, heure, new Date());
  if (unix === null) {
    return ephemeral(
      '❌ Date ou heure invalide, dépassée, ou hors fenêtre (7 jours glissants). ' +
        'Choisis le jour et l’heure via l’autocomplétion.'
    );
  }

  const creatorId = userId(interaction);
  if (!creatorId) {
    return ephemeral('❌ Impossible de t’identifier.');
  }

  const content = buildSessionContent({
    unix,
    places,
    roleId: mission.role_id,
    creatorId,
  });
  return sessionMessage(content, parseSession(content).full, mission.role_id);
}

/** ------------------------------------------------------------------ *
 *  Buttons (Join / Leave)
 *  ------------------------------------------------------------------ */

function handleComponent(interaction: Interaction): Response {
  const customId = interaction.data?.custom_id ?? '';
  const playerId = userId(interaction);
  const content = interaction.message?.content ?? '';
  if (!playerId) {
    return ephemeral('❌ Impossible de t’identifier.');
  }

  if (customId === CUSTOM_ID_JOIN) {
    const result = joinSession(content, playerId);
    if (!result.ok) {
      const message =
        result.reason === 'already-joined'
          ? '⚠️ Tu es déjà inscrit à cette session.'
          : '⚠️ L’escouade est complète.';
      return ephemeral(message);
    }
    return updateMessage(result.content, parseSession(result.content).full);
  }

  if (customId === CUSTOM_ID_LEAVE) {
    const result = leaveSession(content, playerId);
    if (!result.ok) {
      return ephemeral('⚠️ Tu n’es pas inscrit à cette session.');
    }
    return updateMessage(result.content, parseSession(result.content).full);
  }

  return ephemeral('❌ Bouton inconnu.');
}

/** ------------------------------------------------------------------ *
 *  Autocomplete
 *  ------------------------------------------------------------------ */

async function handleAutocomplete(interaction: Interaction, env: Env): Promise<Response> {
  const option = focusedOption(interaction);
  if (!option) return json({ type: 8, data: { choices: [] } });

  let choices: Array<{ name: string; value: string | number }>;

  if (option.name === 'mission') {
    choices = await missionChoices(env.CATALOGUE_KV, String(option.value ?? ''));
  } else if (option.name === 'jour') {
    choices = daySuggestions(String(option.value ?? ''), new Date());
  } else if (option.name === 'heure') {
    // The `jour` option may already be filled: its value is the day at
    // 00:00 Paris, which scopes the half-hour slots.
    const day = String(options(interaction).get('jour') ?? '') || undefined;
    choices = timeSuggestions(String(option.value ?? ''), new Date(), day);
  } else {
    choices = [];
  }

  return json({ type: 8, data: { choices } }); // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
}

/** `/catalogue_ajouter mission role places` and `/catalogue_retirer mission` (moderators). */
async function handleCatalog(interaction: Interaction, command: string, env: Env): Promise<Response> {
  const opts = options(interaction);

  if (command === 'catalogue_ajouter') {
    const name = String(opts.get('mission') ?? '').trim();
    const roleId = String(opts.get('role') ?? '');
    const slots = Number(opts.get('places'));

    const result = await addMission(env.CATALOGUE_KV, { name, role_id: roleId, slots });
    if (result === 'invalid') {
      return ephemeral(
        `❌ Mission invalide : nom de 1 à ${MAX_MISSION_LENGTH} caractères, rôle valide, places ${ALLOWED_SLOTS.join(' ou ')}.`
      );
    }
    if (result === 'duplicate') {
      return ephemeral(`⚠️ La mission « ${name} » existe déjà dans le catalogue.`);
    }
    return ephemeral(
      `✅ Mission « ${name} » ajoutée (rôle <@&${roleId}>, ${slots} places recommandées).`
    );
  }

  const removed = await removeMission(env.CATALOGUE_KV, String(opts.get('mission') ?? ''));
  return removed
    ? ephemeral('🗑️ Mission retirée du catalogue.')
    : ephemeral('❌ Mission introuvable dans le catalogue.');
}

/** ------------------------------------------------------------------ *
 *  Worker entry point
 *  ------------------------------------------------------------------ */

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
    // discord-interactions v4: verifyKey is async — it MUST be awaited,
    // otherwise the returned Promise is truthy and every request passes.
    const isValidRequest = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      return new Response('Bad request signature', { status: 401 });
    }

    const interaction = JSON.parse(body) as Interaction;

    // TYPE 1: PING — required by Discord to validate the endpoint.
    if (interaction.type === 1) {
      return json({ type: 1 });
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
