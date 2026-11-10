/**
 * Registers the bot's slash commands on Discord.
 *
 * Run locally (never on the Worker): `node register.js [guildId]`.
 * - With a guild id: instant registration, ideal for testing.
 * - Without: global registration (can take up to 1 hour to propagate).
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
        choices: [1, 2, 3, 4, 5, 6].map((n) => ({
          name: `${n} joueur${n > 1 ? 's' : ''}`,
          value: n,
        })),
      },
      {
        name: 'date_heure',
        description: 'Date et heure — ex : jeu 20h, demain 18h30, 12/11 21h',
        type: 3, // STRING
        required: true,
        autocomplete: true,
      },
      {
        name: 'role',
        description: 'Rôle à ping pour annoncer la session',
        type: 8, // ROLE
        required: false,
      },
    ],
  },
  {
    name: 'catalogue_ajouter',
    description: 'Ajouter une mission au catalogue',
    default_member_permissions: MANAGE_MESSAGES,
    options: [
      {
        name: 'mission',
        description: 'Nom exact de la mission',
        type: 3, // STRING
        required: true,
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

const guildId = process.argv[2];
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

console.log(
  `Registered ${commands.length} commands ${guildId ? `on guild ${guildId}` : 'globally (up to 1h to appear)'}.`
);
