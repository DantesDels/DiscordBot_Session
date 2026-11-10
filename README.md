# 🤖 Navis — Bot de Sessions Discord (Architecture Serverless)

Bot de gestion de sessions de jeu pour le serveur **AETERNUM**. Objectif : créer des escouades **sans aucune erreur de saisie manuelle** — tout passe par l'autocomplétion et des boutons — avec des comptes à rebours dynamiques et une notification du créateur quand l'équipe est complète.

---

## 📖 Utilisation du bot

### Créer une session : `/session`

La commande prend **trois options**, toutes en autocomplétion :

| Option | Description |
|---|---|
| `mission` | Mission choisie dans le catalogue (elle porte le **rôle à ping** et la **taille d'escouade**) |
| `jour` | Jour de la session |
| `heure` | Créneau horaire de la session |

**`mission`** — la liste vient du catalogue KV en temps réel (insensible aux accents/casse : taper `operation` trouve « Opération Brèche »). La mission détermine tout : le rôle pingé dans le message et le nombre de places (4 ou 6). Il n'y a **pas d'option `places`** : impossible de se tromper.

**`jour`** — le menu propose dans l'ordre :
1. « **Aujourd'hui** » et « **Demain** » ;
2. puis les jours suivants de la fenêtre glissante de **7 jours**, libellés « jeudi 12 novembre », etc.

Saisie manuelle supportée : préfixe ou nom de jour de la semaine (« mar », « jeudi ») ou date numérique « 13/11 ». En interne, la valeur transmise est le timestamp UNIX du jour à 00:00 (heure de Paris).

**`heure`** — le menu couvre **toute la plage disponible** :
- Sans jour choisi (ou jour = aujourd'hui) : les **prochaines 24 h** à partir de maintenant, y compris après minuit — ces créneaux sont marqués « 01:30 (demain) » pour lever toute ambiguïté ;
- Jour futur sélectionné : la journée entière (00:00 → 23:00) ;
- Par défaut les créneaux sont **horaire** : la limite Discord de 25 choix empêche d'afficher 48 créneaux de 30 min d'un coup ;
- **Dès que tu tapes une heure** (« 20 », « 2030 », « 20h30 »), la liste passe en créneaux de **30 minutes** à partir du créneau tapé (les minutes sont arrondies à la demi-heure inférieure : 20h10 → 20:00) ;
- Une heure déjà passée aujourd'hui roule automatiquement sur le même horaire **demain** (« 8h » tapé à 22h = 08:00 demain).

Règles communes : fenêtre glissante de 7 jours, jamais dans le passé, tout créneau aligné sur :00 / :30. Toute suggestion cliquée reste soumissible même si elle devient obsolète quelques minutes plus tard (elle bascule sur l'occurrence à venir).

### Le message de session

```
<@&RÔLE_MISSION> — mardi 10 novembre 2026 à 20:00 (dans 7 heures)
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
⚔️ @Créateur
[ Vide ]
[ Vide ]
[ Vide ]
```

- Le **ping du rôle** tient lieu de nom de mission (pas de texte à maintenir en cohérence) ;
- La date utilise les timestamps Discord `<t:X:F>` / `<t:X:R>` : formatée dans le fuseau de chaque lecteur + **compte à rebours en direct** ;
- La **première place occupée est le créateur** (pas de ligne dédiée) ; les places libres s'affichent `[ Vide ]` ;
- Le nombre de lignes = la taille d'escouade de la mission (4 ou 6).

### Rejoindre / Quitter

Deux boutons sous le message : `⚔️ Rejoindre` et `❌ Quitter`.

- **Rejoindre** : la première place `[ Vide ]` est remplacée par `⚔️ @Joueur`, le message est édité en place (réponse de type 7) ;
- **Quitter** : la place redevient `[ Vide ]`, la bannière éventuelle disparaît ;
- Les erreurs (« déjà inscrit », « escouade complète », « pas inscrit ») sont des réponses **éphémères** visibles uniquement du cliqueur.

### Escouade complète

Dès que la dernière place est prise :

```
✅ **Escouade complète** — @Créateur à toi de jouer !
```

La bannière **ping le créateur** pour le feu vert final, et les deux boutons sont désactivés (aucun dépassement possible). Si quelqu'un quitte, la bannière disparaît et les boutons se réactivent.

### Gérer le catalogue : commandes modérateur

| Commande | Effet |
|---|---|
| `/catalogue_ajouter mission role places` | Ajoute une mission (rôle à ping, places **4 ou 6**) |
| `/catalogue_retirer mission` | Retire une mission du catalogue |

Ces commandes sont réservées aux membres ayant la permission **Gérer les messages** (restriction via `default_member_permissions` ; le rôle MODÉRATEURS la possède). Une mission ajoutée apparaît immédiatement dans l'autocomplétion de `/session`.

---

## 🧠 Décisions de conception

- **100 % Serverless (Cloudflare Worker)** : le code ne tourne que lorsqu'une commande est tapée ou un bouton cliqué (HTTP Interactions Endpoint). Pas de connexion gateway/WebSocket → pas de privileged intents, zéro coût, zéro serveur à maintenir.
- **Le message est la base de données** : l'état de la session vit dans le texte du message Discord (`[ Vide ]` lu/modifié via `interaction.message.content`). Pas de base de données, rien à nettoyer — supprimer le message supprime la session.
- **Un seul blob JSON en KV pour le catalogue** (clé `missions`) : listing atomique, pas de pagination ni de retard de cohérence éventuelle de `list()`. Les écritures sont rares (modérateurs), les conflits lecture-modification-écriture ne sont pas un souci à cette échelle.
- **La mission porte tout** : rôle pingé et taille d'escouade viennent du catalogue — `/session` n'expose aucune option libre.
- **Raisonnement horloge murale en Europe/Paris** : les jours sont découpés à minuit Paris ; les valeurs transmises à Discord sont des timestamps UNIX.
- **Zéro saisie libre côté joueur** : uniquement composants (boutons) et autocomplétion.

---

## 🏗️ Architecture des dossiers

```
DiscordBot_Session/
├── src/                          # Code du Worker (TypeScript, bundlé par Wrangler)
│   ├── index.ts                  # Routeur principal : vérif. Ed25519 + dispatch par type d'interaction
│   ├── env.ts                    # Bindings Cloudflare (clé publique, KV)
│   │
│   ├── discord/                  # Couche « protocole Discord »
│   │   ├── interaction.ts        # Payloads d'interaction + extraction d'options / auteur / option focus
│   │   ├── responses.ts          # Constructeurs de réponses (ping, éphémère, message session, update, autocomplete)
│   │   ├── choices.ts            # Forme d'un choix d'autocomplétion + limite Discord (25)
│   │   └── verify.ts             # Vérification de signature Ed25519 (verifyKey, obligatoirement awaité)
│   │
│   ├── handlers/                 # Un handler par type d'interaction entrant
│   │   ├── session.ts            # Type 2 : /session (résolution mission + jour + heure → message)
│   │   ├── catalog.ts            # Type 2 : /catalogue_ajouter et /catalogue_retirer
│   │   ├── component.ts          # Type 3 : boutons Rejoindre/Quitter (édition en place)
│   │   └── autocomplete.ts       # Type 4 : dispatch des options mission / jour / heure
│   │
│   ├── missions/                 # Catalogue de missions
│   │   ├── model.ts              # Validation (nom ≤ 100, rôle snowflake, places 4 ou 6) + recherche par nom
│   │   ├── store.ts              # Persistance KV (get/add/remove sur le blob `missions`)
│   │   └── autocomplete.ts       # Choix d'autocomplétion : préfixes d'abord, insensible aux accents
│   │
│   ├── sessions/                 # Modèle « le message est le stockage »
│   │   ├── content.ts            # Format du message (header, lignes ⚔️ / [ Vide ]) + parsing
│   │   ├── membership.ts         # Transitions rejoindre/quitter + bannière de complétion
│   │   └── components.ts         # Boutons Rejoindre/Quitter + custom_ids
│   │
│   └── time/                     # Date & heure
│       ├── constants.ts          # Fenêtre 7 jours, jour, heure, demi-heure (secondes)
│       ├── paris.ts              # Conversions Europe/Paris ↔ UNIX + libellés FR (jours, heures)
│       ├── window.ts             # Règle de fenêtre glissante anti-passé
│       ├── text.ts               # Parsing de la saisie clavier (heures « 20h30 »/« 2030 », jours « mar », « 13/11 »)
│       ├── daySuggestions.ts     # Suggestions de l'option `jour`
│       ├── timeSuggestions.ts    # Suggestions de l'option `heure`
│       └── combine.ts            # Combinaison jour + heure → timestamp final validé
│
├── tests/                        # Tests centralisés (miroir de src/)
│   ├── helpers.ts                # Fixtures partagées : MockKV, référence temporelle fixe, session de base
│   ├── missions/                 # store.test.ts, autocomplete.test.ts
│   ├── sessions/                 # content.test.ts, membership.test.ts, components.test.ts
│   └── time/                     # window, daySuggestions, timeSuggestions, combine
│
├── config/                       # Configuration versionnée
│   ├── wrangler.toml             # Nom du worker, clé publique (publique, committable), binding KV
│   ├── tsconfig.json             # Typecheck de src/ ET tests/
│   └── missions.json             # Catalogue source de vérité (poussé en KV par npm run catalog:sync)
│
├── register.js                   # Enregistrement des commandes slash auprès de Discord
├── sync-catalog.js               # config/missions.json → clé KV `missions`
├── .env                          # Secrets locaux (git-ignoré) — voir tableau ci-dessous
├── LICENSE
├── package.json
└── README.md
```

**Principe : une responsabilité par fichier.** Chaque dossier est une couche (`discord` = protocole, `handlers` = entrée par type d'interaction, `missions`/`sessions`/`time` = domaines purs). `src/index.ts` ne fait que vérifier la signature et router — tout le reste est testable sans Discord.

### Routage des interactions

Tout passe par le `fetch` handler de `src/index.ts`, après vérification de la signature Ed25519 (401 immédiat sinon) :

| Type | Interaction | Handler | Réponse |
|---|---|---|---|
| 1 | PING (validation de l'URL par Discord) | `ping()` | `{ type: 1 }` |
| 2 | `APPLICATION_COMMAND` | `handleSession` / `handleCatalog` | Message de session (type 4) ou éphémère (flags 64) |
| 3 | `MESSAGE_COMPONENT` (boutons) | `handleComponent` | Édition du message (type 7) ou éphémère |
| 4 | `AUTOCOMPLETE` | `handleAutocomplete` | Choix (type 8, max 25) |

---

## 🔧 Développement local

**Prérequis :** Node.js + npm, un compte Cloudflare (pour le déploiement).

### Scripts npm

| Script | Rôle |
|---|---|
| `npm run dev` | Worker local via `wrangler dev` (KV simulé par miniflare) |
| `npm run typecheck` | `tsc` sur `src/` **et** `tests/` |
| `npm test` | Vitest — suite complète |
| `npm run register` | `node register.js` — pousse les définitions de commandes sur la guild |
| `npm run catalog:sync` | `sync-catalog.js` — valide `config/missions.json` et pousse le blob en KV |
| `npm run deploy` | `wrangler deploy` — déploie le Worker |

### Variables d'environnement (`.env`, git-ignoré)

Modèle : `config/.env.example` (à copier en `.env` à la racine). Le Worker n'a besoin que de `DISCORD_PUBLIC_KEY` (déjà dans `wrangler.toml` `[vars]`) ; les scripts locaux lisent le reste.

| Variable | Usage |
|---|---|
| `DISCORD_APP_ID` | ID de l'application Discord (enregistrement des commandes) |
| `DISCORD_PUBLIC_KEY` | Clé publique — vérification des signatures (aussi en clair dans `config/wrangler.toml` `[vars]`, committable) |
| `DISCORD_BOT_TOKEN` | Token du bot (scripts `register.js` et `sync-catalog.js`) |
| `SERVER_ID` | Guild par défaut pour l'enregistrement (AETERNUM) |
| `ROLE_ADMIN_ID` | Rôle MODÉRATEURS (restrictions des commandes catalogue) |
| `CATALOGUE_KV` | ID du namespace KV Cloudflare |

### Tests

`tests/` centralise tous les tests et **reflète l'arborescence de `src/`**. Les fixtures partagées vivent dans `tests/helpers.ts` : mock KV en mémoire, référence temporelle fixe (mardi 10 novembre 2026, 13:00 Paris) et session de base à 4 places. Tout est logique pure — aucun appel réseau, aucune dépendance à Discord.

---

## 🚀 Checklist de lancement & déploiement

### 1. Configuration Discord (Portail Développeur)
- [ ] Créer une application sur le [Discord Developer Portal](https://discord.com/developers/applications) ;
- [ ] Onglet *Bot* : désactiver les *Privileged Gateway Intents* (inutiles en serverless) ;
- [ ] Récupérer **App ID**, **Bot Token** et **Public Key**.

### 2. Environnement Cloudflare
- [ ] `npm install` ;
- [ ] Renseigner `DISCORD_PUBLIC_KEY` dans `config/wrangler.toml` `[vars]` ;
- [ ] Créer un **KV Namespace** sur le dashboard et lier son id dans `config/wrangler.toml` ;
- [ ] Renseigner les secrets dans `.env`.

### 3. Enregistrement des commandes
- [ ] `npm run register` — pousse les définitions de `/session`, `/catalogue_ajouter`, `/catalogue_retirer` (guild = `SERVER_ID`, instantané ; global = ~1 h) ;
- [ ] Vérifier que le rôle MODÉRATEURS possède la permission *Gérer les messages* (restriction des commandes catalogue).

### 4. Déploiement
- [ ] `npm run catalog:sync` (première fois) pour remplir le catalogue KV ;
- [ ] `npm run deploy` ;
- [ ] Copier l'URL du worker (`https://<nom>.workers.dev`) et la coller dans le champ **Interactions Endpoint URL** du portail ;
- [ ] Tester : `/session` dans un salon du serveur.

**Important : déployer le Worker n'enregistre PAS les commandes.** Après toute modification des définitions de commandes (options, descriptions…), relancer `npm run register` — et seulement dans ce cas.

---

## ⚠️ Pièges opérationnels

- **L'autocomplétion renvoie la *valeur*, pas le libellé** : pour `jour`/`heure` ce sont des timestamps UNIX. Le handler de soumission les re-valide via `parseDayTime` (une suggestion peut devenir obsolète quelques minutes après avoir été cliquée).
- **Limite Discord de 25 choix** en autocomplétion : d'où la liste horaire par défaut de l'option `heure` (48 créneaux de 30 min ne tiennent pas), avec passage en 30 min dès qu'une heure est tapée.
- **Les pings de rôle dans un message de bot sont silencieusement ignorés** par Discord sans `allowed_mentions: { roles: [...] }` — géré dans `discord/responses.ts`.
- **`verifyKey` (discord-interactions v4) est asynchrone** : non attendue, la Promise est truthy et *toutes* les requêtes passent la vérification. Le wrapper `src/discord/verify.ts` l'attend explicitement.
- **`npm run catalog:sync` remplace la clé KV entière** : les missions ajoutées via `/catalogue_ajouter` sont écrasées — ne re-synchroniser que pour réinitialiser le catalogue sur le fichier.
- **Cohérence éventuelle de `list()` en KV** : raison pour laquelle le catalogue est un blob unique lu par clé (immédiat).

---

## ✅ Vérifications avant commit

```bash
npm run typecheck
npm test
```

33 tests (9 fichiers) : catalogue, autocomplétion mission, format/transition de session, boutons, fenêtre glissante, suggestions jour/heure, combinaison jour+heure.
