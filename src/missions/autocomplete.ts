/**
 * Mission autocomplete: choices built from the KV catalog (see store.ts).
 *
 * The option NAME is the mission name and the VALUE is the same name — the
 * type-2 handler then resolves role/slots from the catalog. Matching is
 * accent-insensitive, prefixes ranked first.
 */

import { getCatalogue } from './store';
import { MissionConfig } from './model';
import { AutocompleteChoice, MAX_AUTOCOMPLETE_CHOICES } from '../discord/choices';

/** Lowercase and strip diacritics so "Breach" matches "Brèche". */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Autocomplete choices for the `mission` option. */
export async function missionChoices(
  kv: KVNamespace,
  query: string
): Promise<AutocompleteChoice[]> {
  const catalogue = await getCatalogue(kv);
  const q = normalize(query);

  const prefixed: MissionConfig[] = [];
  const included: MissionConfig[] = [];
  for (const mission of catalogue) {
    const n = normalize(mission.name);
    if (q && n.startsWith(q)) prefixed.push(mission);
    else if (!q || n.includes(q)) included.push(mission);
  }

  return [...prefixed, ...included]
    .slice(0, MAX_AUTOCOMPLETE_CHOICES)
    .map((mission) => ({ name: mission.name, value: mission.name }));
}
