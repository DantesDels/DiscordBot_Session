/**
 * Syncs the mission catalog from `config/missions.json` into the Cloudflare
 * KV namespace (key `missions`), replacing whatever was there.
 *
 * Run: `npm run catalog:sync`
 *
 * The file format is validated first (snowflake role ids, slots 1-6) so a
 * typo never breaks the bot in production. Validation mirrors
 * `src/lib/catalog.ts` (the Worker also filters invalid entries on read).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const FILE = 'config/missions.json';
const SNOWFLAKE_RE = /^\d{17,20}$/;

let raw;
try {
  raw = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`Could not parse ${FILE}: ${e.message}`);
  process.exit(1);
}

const missions = raw.missions;
if (!Array.isArray(missions) || missions.length === 0) {
  console.error(`${FILE}: missing or empty "missions" array.`);
  process.exit(1);
}

const seen = new Set();
for (const [index, mission] of missions.entries()) {
  const where = `${FILE}, missions[${index}]`;
  if (typeof mission.name !== 'string' || !mission.name.trim() || mission.name.length > 100) {
    console.error(`${where}: "name" must be a string of 1-100 characters.`);
    process.exit(1);
  }
  if (!SNOWFLAKE_RE.test(String(mission.role_id))) {
    console.error(`${where}: "role_id" must be a Discord snowflake (17-20 digits).`);
    process.exit(1);
  }
  if (!Number.isInteger(mission.slots) || ![4, 6].includes(mission.slots)) {
    console.error(`${where}: "slots" must be 4 or 6.`);
    process.exit(1);
  }
  const key = mission.name.trim().toLowerCase();
  if (seen.has(key)) {
    console.error(`${where}: duplicate name "${mission.name}".`);
    process.exit(1);
  }
  seen.add(key);
}

// KV stores the plain array (same shape as src/lib/catalog.ts expects):
// the source file wraps it in { "missions": [...] } for comments, so write
// the normalized payload to a temp file and push that.
const payload = JSON.stringify(
  missions.map((m) => ({ name: m.name.trim(), role_id: String(m.role_id), slots: m.slots }))
);

const tmpFile = `${FILE}.tmp`;
writeFileSync(tmpFile, payload);

try {
  // Push via wrangler (uses the wrangler.toml binding + OAuth login).
  // All arguments are static constants, so a plain command string is safe.
  const command = [
    'npx wrangler kv key put missions',
    '--binding CATALOGUE_KV',
    '--config config/wrangler.toml',
    '--remote',
    `--path "${tmpFile}"`,
  ].join(' ');
  execFileSync(command, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
} finally {
  unlinkSync(tmpFile);
}

console.log(
  `Validated ${missions.length} missions from ${FILE}:\n` +
    missions.map((m) => `  - ${m.name} (${m.slots} slots, role ${m.role_id})`).join('\n') +
    '\nWritten to KV key "missions". Note: /catalogue_ajouter and /catalogue_retirer also write this key — re-run this sync only when you want to reset the catalog to the file.'
);
