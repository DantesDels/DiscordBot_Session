/**
 * Mission catalog autocomplete backed by the Cloudflare KV namespace.
 *
 * Each mission is a KV entry whose key is the mission name (value is unused).
 * Keys are listed with pagination and matched against the typed query
 * (accent-insensitive, prefix matches ranked first).
 *
 * Note: KV list() is eventually consistent — a freshly added mission may
 * take a few seconds to appear in autocomplete.
 */

const MAX_CHOICES = 25; // Discord hard limit for autocomplete choices
const MAX_KEYS_SCANNED = 500; // keep autocomplete fast on large catalogs

/** Lowercase and strip diacritics so "Breach" matches "Brèche". */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export interface AutocompleteChoice {
  name: string;
  value: string;
}

export async function missionChoices(kv: KVNamespace, query: string): Promise<AutocompleteChoice[]> {
  const q = normalize(query);

  // Fetch all catalog keys (lexicographic order, paginated).
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await kv.list({ cursor, limit: 100 });
    keys.push(...result.keys.map((k) => k.name));
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor !== undefined && keys.length < MAX_KEYS_SCANNED);

  const prefixed: string[] = [];
  const included: string[] = [];
  for (const key of keys) {
    const n = normalize(key);
    if (q && n.startsWith(q)) prefixed.push(key);
    else if (!q || n.includes(q)) included.push(key);
  }

  return [...prefixed, ...included]
    .slice(0, MAX_CHOICES)
    .map((name) => ({ name, value: name }));
}
