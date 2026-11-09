# 🤖 Bot de Sessions Discord (Architecture Serverless)

## 🎯 Objectif Principal
Créer un utilitaire de gestion de sessions de jeu fluide et sans erreur de saisie. Le bot permet aux joueurs de générer une escouade via des menus d'autocomplétion, d'afficher des comptes à rebours dynamiques, et de gérer les inscriptions directement via des boutons interactifs, le tout avec une notification finale au créateur lorsque l'équipe est complète.

## 🏗️ Choix Architectural
Le projet repose intégralement sur **Cloudflare Workers (Serverless)**. 
- **Zéro serveur dédié :** Le code ne s'exécute que lorsqu'une commande est tapée ou qu'un bouton est cliqué (via des Webhooks HTTP de type "Interactions Endpoint").
- **Zéro coût :** Le Free Tier de Cloudflare est largement suffisant pour ce cas d'usage.
- **Zéro base de données lourde :** Le bot utilise le texte du message Discord lui-même comme "mémoire" temporaire de la session (en y lisant et modifiant les cases `[ Vide ]`).

## ✨ Fonctionnalités Clés
- **Catalogue Dynamique (Cloudflare KV) :** La liste des missions est stockée dans un espace clé-valeur. Les modérateurs peuvent ajouter ou retirer des missions via des commandes restreintes (ex: `/admin_catalogue`) sans toucher au code.
- **Autocomplétion Intelligente (Type 4) :**
  - *Mission :* Recherche en temps réel dans la base KV dès que le joueur tape les premières lettres.
  - *Places :* Sélection rapide via un menu fixe (1 à 6 joueurs).
  - *Date & Heure :* Algorithme sur mesure gérant une fenêtre glissante de 7 jours avec protection anti-passé. Le joueur tape des raccourcis humains ("jeu 20h"), le bot traduit silencieusement en Timestamp UNIX.
- **Affichage Natif & Dynamique (Type 2) :** Génération d'un message intégrant le ping du rôle concerné, l'heure formatée automatiquement au fuseau du lecteur `<t:X:F>`, et un compte à rebours en direct `<t:X:R>`.
- **Gestion des Boutons (Type 3) :** Boutons `[ ⚔️ Rejoindre ]` et `[ ❌ Quitter ]`. À chaque clic, le bot modifie instantanément le message. Dès que le compte de joueurs atteint le maximum requis, le bot désactive les boutons et mentionne le créateur pour valider le départ.

---

## 🚀 Checklist de Lancement Technique & Setup

### 1. Configuration Discord (Portail Développeur)
- [ ] Créer une nouvelle application sur le [Discord Developer Portal](https://discord.com/developers/applications).
- [ ] Dans l'onglet *Bot*, désactiver les *Privileged Gateway Intents* (inutiles en Serverless).
- [ ] Récupérer les 3 clés fondamentales : **App ID**, **Bot Token**, et **Public Key** (pour la sécurité cryptographique).

### 2. Initialisation de l'Environnement Cloudflare
- [ ] S'assurer d'avoir `Node.js` et `npm` installés en local.
- [ ] Générer le projet : `npm create cloudflare@latest bot-sessions`
- [ ] Installer la librairie de validation Discord : `npm install discord-interactions`
- [ ] Renseigner la `DISCORD_PUBLIC_KEY` dans le fichier de configuration `wrangler.toml`.
- [ ] Créer un espace "KV Namespace" (pour le catalogue) sur le dashboard Cloudflare et le lier dans le `wrangler.toml` (binding).

### 3. Enregistrement des Commandes Slash (API Discord)
- [ ] Créer un script local `register.js` (indépendant du Worker).
- [ ] Définir la structure JSON de la commande `/session` avec les options `mission`, `places`, et `date_heure` configurées avec `autocomplete: true`.
- [ ] Définir la commande de modération (ex: `/catalogue_ajouter`) avec les restrictions de permissions (`default_member_permissions`).
- [ ] Exécuter `node register.js` une seule fois pour pousser cette structure sur les serveurs de Discord.

### 4. Développement du Worker (Routeur HTTP)
- [ ] **Fondations :** Coder le `fetch handler` pour intercepter les requêtes POST et valider la signature Ed25519 (renvoyer 401 si invalide).
- [ ] **Le Ping (Type 1) :** Coder la réponse de vérification obligatoire de Discord au moment de lier l'URL.
- [ ] **L'Autocomplétion (Type 4) :** Intégrer l'algorithme des 7 jours glissants pour la date, et la lecture du KV Namespace pour la liste des missions.
- [ ] **La Création (Type 2) :** Coder la réception de la commande finale pour générer le message textuel (avec les balises Timestamp) et attacher les Message Components (Boutons Rejoindre/Quitter).
- [ ] **L'Interaction Bouton (Type 3) :** Coder la logique qui lit le contenu du message actuel (`interaction.message.content`), met à jour la liste des joueurs, vérifie si l'escouade est pleine, et renvoie l'édition du message (`UPDATE_MESSAGE`).

### 5. Déploiement et Liaison
- [ ] Pousser le code en ligne via le terminal : `npx wrangler deploy`
- [ ] Copier l'URL générée par Cloudflare (`https://...workers.dev`).
- [ ] Coller cette URL dans le champ *Interactions Endpoint URL* sur le Discord Developer Portal.