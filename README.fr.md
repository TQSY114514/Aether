<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="Aether" />

# Aether

### Local-first · Multi-model · Agent-native

Discutez avec n'importe quel modèle, exécutez un agent de codage sûr et comparez les modèles côte à côte — sur votre bureau ou dans votre terminal.

**Electron + Node.js · React + TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![npm downloads](https://img.shields.io/npm/dm/aetherai?style=flat-square&label=npm%20downloads)](https://www.npmjs.com/package/aetherai) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 43](https://img.shields.io/badge/Electron-43-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>Les traductions peuvent être en retard par rapport aux versions anglaise / chinois simplifié.</sup>

</div>

---

> **Statut : Beta.** Aether est un projet solo / hobby. Ça fonctionne, mais
> attendez-vous à des aspérités. Les rapports de bugs sont les bienvenus — voir
> [CONTRIBUTING.md](./CONTRIBUTING.md) et [SECURITY.md](./SECURITY.md).

> [!CAUTION]
> **L'avertissement Windows SmartScreen est normal.** Aether est développé par un développeur étudiant sans certificat commercial de signature de code : Windows 11 / Defender peut donc afficher « Windows a protégé votre PC » au premier lancement.
> **L'application est sûre et open source — examinez le code, puis cliquez sur « Plus d'infos → Exécuter quand même ».**
> Si votre antivirus la met en quarantaine, ajoutez le dossier de l'application aux exclusions de l'antivirus (voir [Téléchargement](#téléchargement) pour plus de détails). Aucune donnée ne quitte votre machine, hormis vers les fournisseurs LLM que vous configurez.

**Plateforme : Windows uniquement.** Les builds officiels, les tests et le support ciblent Windows. macOS / Linux peuvent être compilés depuis les sources mais ne sont pas officiellement pris en charge, et la signature de code n'est pas prévue — attendez-vous à un avertissement SmartScreen « éditeur inconnu » au premier lancement (voir [Téléchargement](#téléchargement)).

**Une application pour chaque modèle.** OpenAI / Claude / DeepSeek / modèles locaux / tout point de terminaison compatible OpenAI — discutez, exécutez un agent de codage et comparez les modèles face à face dans une arène multi-modèles avec vote ELO.

**Local-first par conception.** Les clés API et les conversations vivent dans une base de données SQLite locale et ne quittent jamais votre machine — sauf vers les fournisseurs que vous configurez.

**Sûr par défaut.** L'agent intégré s'exécute dans un sandbox d'espace de travail avec une échelle de permissions : l'accès aux fichiers et aux commandes est confirmé avant d'avoir lieu, et chaque appel d'outil est auditable.

---

## Deux produits, un dépôt

Aether se présente sous la forme de deux artefacts indépendants qui partagent le même runtime d'agent :

- **Aether Desktop** — l'interface graphique Electron + React. Téléchargez-la depuis [GitHub Releases](#téléchargement--bureau). Fonctionne immédiatement.
- **Aether CLI / TUI / SDK** — agent headless, UI terminal Ink v5 et SDK sans Electron. Installez avec `npm install -g aetherai` ([installation →](#téléchargement--cli--tui--sdk)). Le binaire CLI est `aether`.

> **Aether a commencé comme une application de bureau.** La CLI et la TUI ont été ajoutées plus tard et sont toujours en rattrapage. Si vous voulez simplement un environnement de travail IA fonctionnel, commencez par **Aether Desktop**. La couche CLI/TUI/SDK est expérimentale : les API et le comportement peuvent changer, et certaines fonctionnalités peuvent être incomplètes ou peu fiables.

Les deux partagent `agentCore`, 42 outils, la mémoire SQLite, le routage multi-modèles, les serveurs MCP et le même magasin de sessions. Une discussion commencée dans l'interface graphique peut être reprise dans le TUI avec `aether tui --session <id>` et inversement.

---

## Ce qui rend Aether différent

Aether combine plusieurs capacités, habituellement réparties entre plusieurs outils, dans une seule application de bureau locale :

| Capacité | Description | Maturité |
|---|---|:---:|
| **Chat multi-fournisseur** | Basculez entre OpenAI, Claude, DeepSeek et tout point de terminaison compatible OpenAI en pleine conversation. | `Stable` |
| **Boucle d'outils de l'Agent** | 42 outils intégrés avec boucle Plan-Act-Observe, sandbox, échelle de permissions. | `Beta` |
| **Arène multi-modèles** | Envoyez une invite à plusieurs modèles, votez pour le meilleur, suivez les classements ELO. | `Beta` |
| **Skills & Extensibilité** | Fichiers `SKILL.md` à déposer, serveurs MCP, système de hooks en 10 points. | `Experimental` |
| **Mémoire structurée** | L'agent se souvient des préférences et des décisions passées entre les sessions. | `Beta` |
| **Planification hiérarchique** | Les demandes complexes se décomposent automatiquement en sous-tâches parallèles. | `Experimental` |
| **Compaction du contexte** | Les longues conversations se résument automatiquement sans perdre les paires d'appels d'outils. | `Beta` |
| **Confidentialité local-first** | Conversations, clés, personas dans SQLite local. Rien ne quitte votre machine. | `Stable` |
| **15 langues d'interface** | Y compris le chinois classique (chinois classique) et l'arabe RTL. | `Beta` |
| **TUI terminal** | Terminal interactif Ink v5 : flux de sessions, cartes d'outils, revue/rollback de diffs, portes de permissions clavier, `/fork` arbre de sessions, `/memory`, réinjection de steering en cours d'exécution. | `Experimental` |
| **CLI headless · RPC · SDK** | CLI à quatre modes (one-shot / NDJSON / JSONL RPC / pipe), SDK sans Electron (`aetherai/sdk`), protocole JSONL appelable par machine. | `Experimental` |
| **Licence MIT** | Entièrement open source. | `Stable` |

---

## Téléchargement

> Choisissez **une** option. Les deux produits partagent le même runtime d'agent et le même magasin de sessions.
> - **Vous voulez juste une application de chat de bureau ?** → [Aether Desktop](#téléchargement--bureau)
> - **Vous voulez un agent terminal / CI / SDK ?** → [Aether CLI](#téléchargement--cli--tui--sdk)

### Téléchargement — Bureau

**Windows — Installateur précompilé (recommandé pour la plupart des utilisateurs)**

Téléchargez la dernière [Release](https://github.com/TQSY114514/Aether/releases) :

| Build | Description |
|---|---|
| **`aetherai-setup-x.y.z.exe`** | Installateur NSIS. Par utilisateur (sans admin), mises à jour automatiques dans l'application. **Recommandé.** |
| **`aetherai-x.y.z.exe`** | Exécutable portable autonome. Aucune installation, aucune mise à jour automatique ; il suffit de l'exécuter. |

> L'installateur affiche un avertissement SmartScreen « éditeur inconnu » au premier lancement — attendu pour une application solo non signée. Toutes les données restent locales.
>
> ⚠️ Certains antivirus peuvent mettre en quarantaine le `electron.exe` extrait pendant l'empaquetage car l'application n'est pas signée. Si votre antivirus supprime l'installateur, ajoutez une exclusion ou utilisez le build portable.

### Téléchargement — CLI / TUI / SDK

**`aetherai`** est le paquet npm. Il regroupe le CLI headless, la TUI interactive Ink v5 et le SDK sans Electron dans un seul binaire.

```bash
# Install once (requires Node.js ≥ 22)
npm install -g aetherai
# or, no install:
npx aetherai "fix the failing test" --model deepseek

# Interactive terminal UI (best in Windows Terminal)
aether tui

# Single-shot prompt (CI / scripts)
aether "summarize README.md"

# JSONL RPC for external scripts
echo '{"type":"request","reqId":"c1","method":"listModels","params":{}}' | aether --mode rpc
```

`aether` et `aetherai` pointent vers le même paquet. Épinglez une version avec `npm install -g aetherai@0.7.1` pour faire correspondre une release du bureau.

> **Partage des données avec la GUI** — les deux produits utilisent la même base de données SQLite (`%APPDATA%/aetherai/aetherai.db`). Une session commencée dans l'application de bureau peut être reprise dans le TUI et inversement.

### Exécuter depuis les sources (développeurs / utilisateurs avancés)

Si vous préférez exécuter depuis les sources, ou modifier le code, utilisez `start.bat` (nécessite [Node.js 22+](https://nodejs.org)) :

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # Windows : installe les dépendances, compile le frontend, lance Electron
```

Voir [Quick Start](#-quick-start) pour la procédure manuelle pas à pas.

> **Deux produits, un seul arbre de sources** — les deux produits vivent dans le même dépôt. `app/electron/` contient le runtime d'agent partagé, `app/src/` est le renderer du bureau, `app/cli.js` + `app/tui/` sont les points d'entrée du CLI/TUI. Les releases sont marquées par git tags (`v*`) et d'une seule étiquette sortent à la fois l'installateur de bureau et la publication npm.

---

## Quick Start

**Prérequis :** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # développement (rechargement à chaud)
npm run build    # frontend de production
npm start        # lance Electron
```

Ou exécutez `start.bat` à la racine du dépôt sous Windows.

### Essayer le terminal (aucune fenêtre Electron nécessaire)

```bash
cd app && npm install
node cli.js tui              # UI terminal interactive (Node ≥ 22 ; expérience optimale dans Windows Terminal)
node cli.js "salut"           # prompt one-shot
echo "résume ça" | node cli.js  # stdin en pipe comme prompt
node cli.js --mode json "x"  # flux d'événements NDJSON (scripts/CI)
node cli.js tui --smoke      # smoke test de la machine à états headless
```

### Configurer le fournisseur

1. Après le lancement, cliquez sur **Modèles** dans la barre latérale.
2. Ajoutez un fournisseur (nom / URL API / clé API).
3. Cliquez sur **Récupérer les modèles** pour charger la liste des modèles disponibles.
4. Revenez au chat et commencez à discuter.

### Activer le mode Ask

1. Ouvrez **Paramètres - Agent & Sécurité**.
2. Réglez le mode de permission de l'agent sur **Ask**.
3. Vérifiez que la racine de l'espace de travail est le dossier que l'agent doit pouvoir lire/écrire.
4. Gardez **Yolo** désactivé, sauf si vous voulez un accès sans restriction.

### Exécuter votre première tâche d'agent

1. Ouvrez un nouveau chat.
2. Demandez : `List the files in this project and summarize what the app does.`
3. Examinez chaque appel d'outil proposé. Approuvez les lectures sûres ; refusez tout ce qui est inattendu.
4. Consultez la trace de raisonnement en direct et la réponse finale.

---

## Fonctionnalités

**Libellés de statut :** `Stable` = prêt pour un usage quotidien, `Beta` = utilisable avec des aspérités connues, `Experimental` = comportement nouveau/avancé susceptible de changer, `Planned` = élément de feuille de route documenté.

### Chat

| Fonctionnalité | Statut | Description |
|---|:---:|---|
| **Multi-fournisseur** | `Stable` | Couche d'adaptateur unique ; ajouter un fournisseur = un fichier. Couvre OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Streaming concurrent** | `Stable` | Un chat streame pendant que vous continuez à discuter dans un autre. |
| **Curseur d'effort de réflexion** | `Beta` | Vrais paramètres : séries OpenAI o / gpt-5 / Claude via relais. Efficace uniquement sur les modèles de raisonnement. |
| **Pièces jointes** | `Beta` | Fichiers texte comme contexte ; images pour le multimodal (nécessite un modèle de vision). |
| **Repli des longs collages** | `Stable` | Des centaines de lignes se replient automatiquement en un extrait dépliable (style ChatGPT). |
| **Édition de messages** | `Stable` | Réécriture + régénération à partir de n'importe quel point. |
| **Recherche de messages** | `Stable` | Avec mise en évidence dans tous les messages. |
| **Résumés de la barre latérale** | `Beta` | Phrases de sujet générées par modèle, pas de texte copié. |

### Agent (Function Calling)

- `Beta` **42 outils intégrés** — opérations fichiers (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), web (`web_search`, `web_fetch`), shell (`run_command`), git & GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), intelligence de code (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), méta-agent (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — avec une boucle Plan-Act-Observe, trace de raisonnement en direct + liste de tâches, détection de boucles, timeouts par outil, budget d'itérations configurable (25 tours par défaut) et compaction du contexte.
- `Experimental` **Planification hiérarchique** — génère automatiquement la décomposition des tâches pour les demandes complexes (inspirée de DS4).
- `Experimental` **Délégation de sous-agents** — les sous-tâches indépendantes s'exécutent en parallèle via `delegate_task`.
- `Stable` **Modes de permission** — échelle ascendante de risque :

| Mode | Description | Sandbox |
|---|---|:---:|
| **Off** | Chat simple, pas d'outils | N/A |
| **Plan** | Outils en lecture seule (investiguer sans modifier) | - |
| **Ask** | Confirmer chaque action risquée (recommandé) | - |
| **Auto** | Tout exécuter, sans confirmation | Oui |
| **Yolo** | Permission totale, sans sandbox | Non |

- `Stable` **Sandbox d'espace de travail** — `write_file`/`edit_file` sont refusés en dehors de la racine de l'espace de travail configuré ; `run_command` bloque les motifs destructeurs. Configurable dans Paramètres - Agent & Sécurité.
- `Beta` **Compaction du contexte** — résume automatiquement l'historique plus ancien (paires appel-résultat d'outil conservées intactes ; identifiants préservés à la lettre).
- `Beta` **Réparation des appels d'outils** — répare automatiquement le JSON malformé, les arguments manquants, les clés non entre guillemets et les appels tronqués.

### Mémoire & Apprentissage

- `Beta` **Mémoire à long terme automatique** — les souvenirs pertinents sont injectés avant chaque tour ; les faits clés sont extraits et enregistrés automatiquement. Activable dans Paramètres - Agent.
- `Experimental` **Apprenant d'habitudes** — détecte les préférences récurrentes (par ex. « toujours utiliser Claude ») et propose des skills appliqués automatiquement.
- `Beta` **Journal d'audit** — trace d'exécution de l'agent par tour pour le débogage.

### Arène

- `Beta` **Arène multi-modèles** — une invite, plusieurs modèles répondent **concurremment** ; votez pour le meilleur et un **classement ELO** se met à jour automatiquement. Les modèles sont notés **par intention** (codage / maths / traduction / résumé / général). *Aucune autre application de chat de bureau local-first n'embarque une arène multi-modèles intégrée avec ELO.*

### Skills & Extensibilité

| Composant | Format | Statut | Détails |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | À déposer dans `<workspace>/.claude/skills/` ; fournit `release-checklist` et `git-commit` |
| **Commandes Slash** | `CMD.md` | `Stable` | 6 intégrées : `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 points du cycle de vie : PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Les serveurs MCP externes fusionnent automatiquement avec les outils intégrés |

### Personnalisation

| Paramètre | Statut | Description |
|---|:---:|---|
| **Paramètres avancés du modèle** | `Stable` | Max tokens, température, top_p, préfixe système personnalisé, titres automatiques par langue, effort de réflexion |
| **Arrière-plan personnalisé** | `Stable` | Importer une image avec contrôles d'opacité / flou |
| **Personas** | `Stable` | Préréglages de prompt système, commutables par session |
| **Thèmes** | `Stable` | Clair / Sombre / Bleu / Verre / Rétro |
| **15 langues d'interface** | `Beta` | Anglais, chinois (simplifié / traditionnel / classique), japonais, espagnol, français, allemand, portugais, russe, ukrainien, arabe (RTL), hindi, coréen |
| **Mise à jour automatique** | `Beta` | L'installateur NSIS vérifie au lancement ; le portable vérifie aussi (installation manuelle) |
| **Suivi d'utilisation** | `Beta` | Journal par appel API avec tokens, coût, latence, taux de succès du cache |

### Confidentialité

> **Toutes les données restent locales.** Aether ne collecte rien et ne téléverse rien vous concernant. Vos clés API, conversations et personas vivent dans une base de données SQLite locale. Les seules requêtes réseau sortantes vont aux fournisseurs LLM que vous configurez.

---

## TUI Terminal, RPC & SDK

Au-delà de l'application de bureau et du CLI simple, Aether fournit une UI terminal interactive, un mode RPC JSONL appelable par machine et un SDK sans Electron. Les trois partagent le même cœur d'agent, la mémoire, les personas, les outils MCP et les règles de permission que le bureau.

### Démarrage rapide — double forme

```bash
# UI terminal interactive (Ink v5 ; nécessite Node ≥ 22)
node app/cli.js tui                # vrai terminal : tapez, approuvez les outils, revoyez les diffs
node app/cli.js tui --smoke        # smoke test de la machine à états headless (sûr en CI, imprime du JSON)

# Prompt one-shot (comme avant)
node app/cli.js "fix the failing test" --mode auto --max-iterations 30

# Flux d'événements NDJSON pour scripts/CI (compat : --json-lines)
echo "summarize README.md" | node app/cli.js --mode json --model deepseek

# Boucle RPC JSONL sur stdin/stdout
printf '{"type":"request","reqId":"c1","method":"listModels","params":{}}\n' \
  | node app/cli.js --mode rpc --db path\to\aetherai.db
```

Drapeaux headless supplémentaires : `--persona <id>` (injection persona + mémoire), `--memory-trace` (rapporte le nombre d'entrées de mémoire injectées), `--skills` (propositions de skills en JSON), `--setup-term` (écrit un profil Windows Terminal), `--stdin` (entrée en pipe explicite).

### TUI (`aether tui`)

Agent terminal interactif (Ink v5 ; Node ≥ 22 ; meilleure expérience dans Windows Terminal) :

- **Sessions** : rendu de messages en flux, arbre de sessions `/fork` (`session.parent_session_id`), `/sessions`, `/use <id>` pour basculer dans l'historique
- **Outils et permissions** : cartes d'appels d'outils (couleur de statut / durée / résumé), revue des diffs (`Alt+v` pour déplier, `Enter` pour accepter / `r` pour annuler — restauration de l'instantané pré-écriture, fonctionne aussi hors répertoire git), portes de permissions clavier (`y` autoriser une fois / `a` toujours autoriser / `n` refuser, ou `←→` pour sélectionner), les outils en lecture seule passent automatiquement
- **Mode d'approbation** : `Shift+Tab` fait défiler `manual → auto-edits → plan` (plan = planification en lecture seule, puis trois options pour décider comment implémenter)
- **Modes** : `Alt+m` bascule ask/plan/auto ; `/persona <id>` change de persona (injecte le préfixe persona + mémoire)
- **Raccourcis leader** : `Ctrl+X` puis `m` sélecteur de modèle / `n` nouvelle session / `l` liste des sessions / `g` timeline / `r` point de contrôle rewind / `q` quitter
- **Palette de commandes** : `Ctrl+P` ou `x` (New chat / Model / Timeline / Export JSONL / Help / Quit)
- **Raccourcis reconfigurables** : `~/.config/aether/keybindings.json` (par ex. `{ "char:?": null }` désactive la touche d'aide `?`)
- **Persistance des clés API** : `/apikey <provider> <key>` sauvegarde dans `auth.json` (les clés chiffrées par safeStorage du bureau ne peuvent pas être déchiffrées en headless ; utilisez cette commande ou la variable d'environnement `AETHER_API_KEY`)
- **Boucle mémoire & skills fermée** : `/memory <mot-clé>` recherche, `--memory-trace` nombre d'entrées injectées, `/skills` + `/skill accept|dismiss <key>` (habitLearner → propositions de skills)
- **Steering** : en cours d'exécution `Ctrl+C` interrompt → saisissez la suite → injectée dans la boucle en cours (la file affiche `steer:n`) ; en cours d'exécution `Tab` met directement la suite en file
- **Raccourcis** : double `Esc` pour quitter (ou `/quit`), `Esc` efface la saisie (le brouillon va dans l'historique), `?` écran d'aide, `PgUp/PgDn`/molette de souris pour défiler, la barre d'état affiche en direct `approval/mode/model/tok/ctx` ; toutes les touches dans [docs/tui-keys.md](./docs/tui-keys.md)

### RPC (`aether --mode rpc`)

Protocole JSONL appelable par machine sur stdin/stdout : trames `request` entrantes, trames `event`/`result`/`error` sortantes — un objet JSON par ligne, aucun texte humain. Méthodes : `run` (streame les événements `text`/`tool`/`plan`/`status`), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. Référence des trames : [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

Agrégation sans Electron du cœur d'agent pour les projets Node externes : `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, trames `rpc`, `sessionContext` (injection persona + mémoire). Déclarations de types incluses (`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Natif Windows

| Capacité | Description |
|---|---|
| **Menu de la barre d'état** | Afficher/masquer la fenêtre, nouvelle session, **nouvelle tâche** (ouvre directement le TaskPanel) ; clic sur l'icône de la barre d'état pour basculer afficher/masquer. |
| **Raccourcis globaux** | `Ctrl+Alt+A` fait apparaître la fenêtre principale (la crée si non lancée) ; le résultat de l'enregistrement est écrit dans le journal de démarrage. |
| **Protocole `aetherai://`** | `aetherai://new` / `chat` nouvelle session ; `aetherai://tui` invite à la forme terminal ; `aetherai://open/?path=<chemin encodé>` définit le dossier comme espace de travail et crée une nouvelle session (chaîne clic droit « Ouvrir avec Aether »). |
| **Inscription au clic droit** | `app/resources/register-protocol.reg` (après remplacement de `<AETHER_EXE>` puis import en administrateur) : `.cs/.js/.ts/.tsx/.md/.json` + dossier → clic droit « Ouvrir avec Aether ». |
| **Guide terminal** | `app/resources/term/aether.ps1` (alias + lancement de `aether tui`) ; `node app/cli.js --setup-term` écrit un profil Windows Terminal (deux jeux de couleurs clair/foncé). |
| **Sandbox renforcé** | Défenses des chemins Windows : `\\?\` chemins longs, UNC `\\server\share`, échappement par points de réanalyse/junctions, extensions dangereuses `.lnk/.scr/.msi` etc. |

---

## Structure du projet

```
app/
├── electron/              # main process (Node)
│   ├── database.js        # better-sqlite3 data layer — 25+ tables (WAL)
│   ├── ipc/               # IPC handlers (chat / arena / session / mcp / ...)
│   │   ├── chat.handler.js    # THE central handler (540 lines)
│   │   ├── arena.handler.js   # Multi-model arena with ELO
│   │   ├── agent.handler.js   # Workspace management
│   │   └── ...
│   ├── llm/               # LLM abstraction (~3,700 lines, 19 files)
│   │   ├── providerAdapter.js # Dispatch by api_format (openai/anthropic)
│   │   ├── openaiAdapter.js   # OpenAI-compatible SSE streaming + retry
│   │   ├── anthropicAdapter.js# Anthropic Messages API
│   │   ├── credentialPool.js  # Multi-key rotation + cooldown
│   │   ├── toolLoop.js        # Plan-Act-Observe with iteration budget
│   │   ├── planning.js        # Hierarchical task decomposition
│   │   ├── subAgent.js        # Parallel sub-agent delegation
│   │   ├── compaction.js      # Context compaction (pair-preserving)
│   │   ├── autoMemory.js      # Long-term structured memory
│   │   ├── habitLearner.js    # Recurring preference -> auto-skills
│   │   ├── hooks.js           # 10-point extensibility hooks
│   │   ├── skills.js          # SKILL.md loader (Claude Code format)
│   │   ├── modelAdvisor.js    # Heuristic model suggestion
│   │   ├── toolCallRepair.js  # Malformed tool-call recovery
│   │   ├── auditLog.js        # Per-turn agent execution trace
│   │   └── ...
│   ├── tools/             # built-in tool registry + sandbox
│   │   ├── registry.js       # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js        # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # MCP client + server manager
│   ├── main.js / preload.js
├── src/                   # renderer (React + TS + Zustand)
│   ├── store/index.ts     # Zustand global state (~1,000 lines)
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 locales) / theme / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, ...)
└── resources/             # App icons
```

---

## Pile technique

| Couche | Technologie |
|---|---|
| Desktop | Electron 43 |
| Frontend | React 18.3 + TypeScript 5.8 |
| State | Zustand 4.5 |
| Build | Vite 8 + electron-builder |
| Database | better-sqlite3 (native SQLite, WAL mode) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |
| TUI | Ink 5 + React 18 (createElement, no JSX) |
| CLI/SDK | Node.js headless CLI (4 modes) + Electron-free SDK |

---

## Remerciements

Aether se tient sur les épaules de ces projets — leurs idées ont façonné l'architecture et l'UX :

### Frameworks d'agents

| Projet | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Modèle de permission de l'agent, curseur de réflexion, visualisation des appels d'outils, délégation de sous-agents, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Compaction du contexte, détection de boucles d'appels d'outils, architecture par flux d'événements |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Budget d'itérations, mémoire structurée à long terme, skills autonomes |
| [OpenAI Codex](https://github.com/openai/codex) | Sandbox, compression du contexte, réparation des appels d'outils |
| [DS4](https://github.com/antirez/ds4) | Décomposition hiérarchique des tâches |

### UI & UX

| Projet | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Méthodologie des composants copier-coller cn() / cva |
| [Magic UI](https://github.com/magicuidesign/magicui) | Motifs d'animation (shimmer, blur-fade) |

### Infrastructure

| Projet | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Normalisation multi-format des fournisseurs |
| [MCP](https://modelcontextprotocol.io) | La spécification que parle l'agent d'Aether |
| [cc-switch](https://github.com/farion1231/cc-switch) | Mise en page du tableau de bord des statistiques d'utilisation |
| [new-api](https://github.com/QuantumNous/new-api) | Relais d'effort de raisonnement, suivi d'utilisation/coût |
| [Continue](https://github.com/continuedev/continue) | Config comme source de vérité, abstraction des fournisseurs |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Exécution d'agent multi-tours, exécution d'outils en sandbox |
| [Aider](https://github.com/Aider-AI/aider) | Boucle d'outils d'assistant de codage LLM, intégration git |
| [Cline](https://github.com/cline/cline) | Agent intégré à l'IDE, intégration MCP, UX des permissions |

---

## Contribuer

Toutes les contributions sont les bienvenues ! Qu'il s'agisse d'un correctif de bug, d'une demande de fonctionnalité, d'une amélioration de traduction ou d'une mise à jour de documentation — veuillez ouvrir une issue ou soumettre une PR.

1. Forkez le dépôt
2. Créez une branche de fonctionnalité (`git checkout -b feat/my-feature`)
3. Commitez vos changements (`git commit -am 'Add feature'`)
4. Poussez vers la branche (`git push origin feat/my-feature`)
5. Ouvrez une Pull Request

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour les directives détaillées.

---

## Licence

[MIT](./LICENSE) © 2025 Aether

---

<div align="center">

Construit avec ❤️ en utilisant Electron + Node.js + React + TypeScript

[⬆ Retour en haut](#aether)

</div>
