import type { Env } from '../env';
import { ephemeral, sessionMessage } from '../discord/responses';
import { Interaction, options, userId } from '../discord/interaction';
import { findMission } from '../missions/model';
import { getCatalogue } from '../missions/store';
import { parseDayTime } from '../time/combine';
import { buildSessionContent, parseSession } from '../sessions/content';

/**
 * `/session mission:<catalogue> jour:<day> heure:<slot>` — role AND squad
 * size come from the mission's catalog entry.
 */
export async function handleSession(interaction: Interaction, env: Env): Promise<Response> {
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
