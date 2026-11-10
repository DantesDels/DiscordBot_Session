import { ephemeral, updateMessage } from '../discord/responses';
import { Interaction, userId } from '../discord/interaction';
import { parseSession } from '../sessions/content';
import { joinSession, leaveSession } from '../sessions/membership';
import { CUSTOM_ID_JOIN, CUSTOM_ID_LEAVE } from '../sessions/components';

/** Join / Leave buttons on a session message (type-3 interactions). */
export function handleComponent(interaction: Interaction): Response {
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
