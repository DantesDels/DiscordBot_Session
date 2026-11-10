import type { Env } from '../env';
import { AutocompleteChoice } from '../discord/choices';
import { autocomplete } from '../discord/responses';
import { Interaction, focusedOption, options } from '../discord/interaction';
import { missionChoices } from '../missions/autocomplete';
import { daySuggestions } from '../time/daySuggestions';
import { timeSuggestions } from '../time/timeSuggestions';

/** Autocomplete interactions (type 4) for the `/session` options. */
export async function handleAutocomplete(interaction: Interaction, env: Env): Promise<Response> {
  const option = focusedOption(interaction);
  if (!option) return autocomplete([]);

  let choices: AutocompleteChoice[];

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

  return autocomplete(choices);
}
