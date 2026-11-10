/**
 * Registers the bot's slash commands on Discord.
 *
 * Run locally (never on the Worker): `node register.js [guildId]`.
 * - The guild id defaults to SERVER_ID from `.env` when omitted.
 * - With a guild id: instant registration, ideal for testing.
 * - Without: global registration (can take up to 1 hour to propagate).
 * - When ROLE_ADMIN_ID is set in `.env`, the catalog commands are restricted
 *   to that role (plus server administrators) via per-guild permissions.
 *
 * Credentials are read from the environment or from `.env` at the project
 * root (see `config/.env.example`): DISCORD_APP_ID and DISCORD_BOT_TOKEN.
 */

import { existsSync, readFileSync } from 'node:fs';

const MANAGE_MESSAGES = '8192'; // Discord permission bit, moderators by default

const commands = [
  {
    name: 'session',
    description: 'Créer une session de jeu (mission, places, date)',
    options: [
      {
        name: 'mission',
        description: 'Mission — autocomplétion depuis le catalogue',
        type: 3, // STRING
        required: true,
        autocomplete: true,
      },
      {
        name: 'places',
        description: 'Nombre de places dans l’escouade (créateur inclus)',
        type: 4, // INTEGER
        required: true,
        // No static choices: autocomplete recommends the mission's size.
        // Discord forbids combining `choices` with `autocomplete`.
        autocomplete: true,
        min_value: 1,
        max_value: 6,
      },
      {
        name: 'date_heure',
        description: 'Date et heure — ex : jeu 20h, demain 18h30, 12/11 21h',
        type: 3, // STRING
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'catalogue_ajouter',
    description: 'Ajouter une mission au catalogue (rôle et places recommandées)',
    default_member_permissions: MANAGE_MESSAGES,
    options: [
      {
        name: 'mission',
        description: 'Nom de la mission',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'role',
        description: 'Rôle Discord pingé lors d’une session de cette mission',
        type: 8, // ROLE
        required: true,
      },
      {
        name: 'places',
        description: 'Nombre de places recommandé (1 à 6)',
        type: 4, // INTEGER
        required: true,
        min_value: 1,
        max_value: 6,
      },
    ],
  },
  {
    name: 'catalogue_retirer',
    description: 'Retirer une mission du catalogue',
    default_member_permissions: MANAGE_MESSAGES,
    options: [
      {
        name: 'mission',
        description: 'Mission à retirer — autocomplétion depuis le catalogue',
        type: 3, // STRING
        required: true,
        autocomplete: true,
      },
    ],
  },
];

function loadDotEnv() {
  const vars = {};
  const file = '.env';
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !line.trimStart().startsWith('#')) vars[match[1]] = match[2];
    }
  }
  return vars;
}

const env = { ...loadDotEnv(), ...process.env };
const appId = env.DISCORD_APP_ID;
const token = env.DISCORD_BOT_TOKEN;

if (!appId || !token) {
  console.error(
    'Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN. ' +
      'Put them in .env (see config/.env.example) or export them.'
  );
  process.exit(1);
}

const guildId = process.argv[2] ?? env.SERVER_ID;
const url = guildId
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`;

const response = await fetch(url, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  console.error(`Registration failed (${response.status}):`);
  console.error(await response.text());
  process.exit(1);
}
const registered = await response.json();
console.log(` -> ${registered.map((c) => c.name).join(', ')}`);

console.log(
  `Registered ${commands.length} commands ${guildId ? `on guild ${guildId}` : 'globally (up to 1h to appear)'}.`
);

// Restrict the catalog commands to ROLE_ADMIN_ID (+ server admins) when set.
// Discord's per-guild command permission endpoints reject bot tokens
// (403 "Bots cannot use this endpoint"), so restriction is enforced via
// `default_member_permissions: MANAGE_MESSAGES` in the command definitions:
// the ROLE_ADMIN_ID role (MODÉRATEURS) holds that permission. For tighter
// per-guild overrides, use Server Settings > Integrations > Bot > Commands.
const adminRoleId = guildId ? env.ROLE_ADMIN_ID : undefined;
if (adminRoleId) {
  console.log(
    `Catalog commands restricted via default_member_permissions (MANAGE_MESSAGES); ` +
      `verify role ${adminRoleId} holds that permission.`
  );
}
