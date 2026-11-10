import { verifyKey } from 'discord-interactions';
import { dateSuggestions, parseDateTime } from './lib/parseDate';
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
import { addMission, removeMission, MAX_MISSION_LENGTH } from './lib/catalog';

// Cloudflare bindings (see wrangler.toml).
export interface Env {
  DISCORD_PUBLIC_KEY: string;
  CATALOGUE_KV: KVNamespace;
}

const MAX_PLACES = 6;

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
function sessionMessage(content: string, full: boolean): Response {
  return json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: { content, components: buildSessionComponents(full) },
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

/** `/session mission:<...> places:<1-6> date_heure:<shortcut> [role:<...>]` */
function handleSession(interaction: Interaction): Response {
  const opts = options(interaction);

  const mission = String(opts.get('mission') ?? '').trim();
  if (!mission) {
    return ephemeral('❌ Mission manquante ou introuvable dans le catalogue.');
  }
  if (mission.length > MAX_MISSION_LENGTH) {
    return ephemeral('❌ Nom de mission trop long.');
  }

  const places = Number(opts.get('places'));
  if (!Number.isInteger(places) || places < 1 || places > MAX_PLACES) {
    return ephemeral(`❌ Le nombre de places doit être compris entre 1 et ${MAX_PLACES}.`);
  }

  const dateHeure = String(opts.get('date_heure') ?? '');
  const unix = parseDateTime(dateHeure, new Date());
  if (unix === null) {
    return ephemeral(
      '❌ Date incomprise ou hors fenêtre (7 jours glissants, jamais dans le passé). ' +
        'Essaie par exemple `jeu 20h`, `demain 18h30` ou `12/11 21h`.'
    );
  }

  const roleId = opts.get('role');
  const creatorId = userId(interaction);
  if (!creatorId) {
    return ephemeral('❌ Impossible de t’identifier.');
  }

  const content = buildSessionContent({
    mission,
    unix,
    places,
    roleId: roleId ? String(roleId) : undefined,
    creatorId,
  });
  return sessionMessage(content, parseSession(content).full);
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
  } else if (option.name === 'date_heure') {
    choices = dateSuggestions(String(option.value ?? ''), new Date());
  } else if (option.name === 'places') {
    choices = Array.from({ length: MAX_PLACES }, (_, i) => ({
      name: `${i + 1} joueur${i > 0 ? 's' : ''}`,
      value: i + 1,
    }));
  } else {
    choices = [];
  }

  return json({ type: 8, data: { choices } }); // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
}

/** `/catalogue_ajouter mission:<...>` and `/catalogue_retirer mission:<...>` (moderators). */
async function handleCatalog(interaction: Interaction, command: string, env: Env): Promise<Response> {
  const mission = String(options(interaction).get('mission') ?? '').trim();

  if (command === 'catalogue_ajouter') {
    const added = await addMission(env.CATALOGUE_KV, mission);
    return added
      ? ephemeral(`✅ Mission « ${mission} » ajoutée au catalogue.`)
      : ephemeral(`❌ Nom de mission invalide (1 à ${MAX_MISSION_LENGTH} caractères).`);
  }

  const removed = await removeMission(env.CATALOGUE_KV, mission);
  return removed
    ? ephemeral(`🗑️ Mission « ${mission} » retirée du catalogue.`)
    : ephemeral(`❌ Mission « ${mission} » introuvable dans le catalogue.`);
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
    if (!verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY)) {
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
        return handleSession(interaction);
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
