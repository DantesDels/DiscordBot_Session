import type { Env } from '../env';
import { ephemeral } from '../discord/responses';
import { Interaction, options } from '../discord/interaction';
import { ALLOWED_SLOTS, MAX_MISSION_LENGTH } from '../missions/model';
import { addMission, removeMission } from '../missions/store';

/**
 * `/catalogue_ajouter mission role places` and `/catalogue_retirer
 * mission` — moderator-only catalog maintenance (restricted at
 * registration time via default_member_permissions).
 */
export async function handleCatalog(
  interaction: Interaction,
  command: string,
  env: Env
): Promise<Response> {
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
