<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Un atelier IA de bureau local-first et multi-modèles

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Projet solo / passion` · `Licence MIT`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Statut : Beta.** AetherAI est un projet solo/passion. Il fonctionne, mais attendez-vous à des aspérités. Les rapports de bugs sont les bienvenus — voir [CONTRIBUTING.md](./CONTRIBUTING.md) et [SECURITY.md](./SECURITY.md).

Unifiez plusieurs fournisseurs de LLM — OpenAI / Claude / DeepSeek / modèles locaux / tout point de terminaison compatible OpenAI — au sein d'une seule application de bureau. Un agent qui lit/écrit des fichiers et exécute des commandes, un sandbox d'espace de travail, une arène multi-modèles avec vote ELO, des skills, et 15 langues d'interface. Tout est stocké localement : les clés API et les conversations ne quittent jamais votre machine, sauf vers les fournisseurs que vous configurez.

---

## Ce qui distingue AetherAI

AetherAI combine plusieurs capacités qui sont généralement réparties sur plusieurs outils au sein d'une seule application de bureau locale :

| Capacité | Description | Maturité |
|---|---|:---:|
| **Chat multi-fournisseurs** | Basculez entre OpenAI, Claude, DeepSeek et n'importe quel point de terminaison compatible OpenAI en plein milieu d'une conversation. | `Stable` |
| **Boucle d'outils Agent** | 16 outils intégrés avec boucle Plan-Act-Observe, sandboxing, échelle de permissions. | `Beta` |
| **Arène multi-modèles** | Envoyez un seul prompt à plusieurs modèles, votez pour le meilleur, suivez les classements ELO. | `Beta` |
| **Skills & Extensibilité** | Fichiers `SKILL.md` à placer directement, serveurs MCP, système de 10 points d'extension. | `Experimental` |
| **Mémoire structurée** | L'agent se souvient des préférences et décisions passées entre les sessions. | `Beta` |
| **Planification hiérarchique** | Les demandes complexes se décomposent automatiquement en sous-tâches parallèles. | `Experimental` |
| **Compression de contexte** | Les longues conversations se résument automatiquement sans perdre les paires d'appels d'outils. | `Beta` |
| **Confidentialité local-first** | Conversations, clés, personas dans SQLite local. Rien ne quitte votre machine. | `Stable` |
| **15 langues d'interface** | Y compris le chinois classique (文言) et l'arabe RTL. | `Beta` |
| **Licence MIT** | Entièrement open source. | `Stable` |

---

## Téléchargement

### Windows — Installateur préconstruit (Recommandé pour la plupart des utilisateurs)

Téléchargez la dernière [Release](https://github.com/TQSY114514/AetherAI/releases) :

| Build | Description |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | Installateur NSIS. Utilisateur unique (pas d'admin), mises à jour automatiques dans l'app. **Recommandé.** |
| **`AetherAI-x.y.z.exe`** | Portable mono-exécutable. Pas d'installation, pas de mise à jour automatique ; lancez-le simplement. |

> L'installateur affiche un avertissement SmartScreen « éditeur inconnu » au premier lancement — attendu pour une application solo non signée. Toutes les données restent locales.
>
> ⚠️ Certains antivirus peuvent mettre en quarantaine l'`electron.exe` décompacté pendant l'emballage car l'application n'est pas signée. Si l'installateur est supprimé par votre AV, ajoutez une exclusion ou utilisez la version portable.

### Exécuter depuis les sources (développeurs / utilisateurs avancés)

Si vous préférez exécuter depuis les sources, ou voulez modifier le code, utilisez `start.bat` (nécessite [Node.js 18+](https://nodejs.org)) :

```bash
git clone https://github.com/TQSY114514/AetherAI.git
cd AetherAI
start.bat        # Windows : installe les deps, construit le frontend, lance Electron
```

Voir [Démarrage rapide](#-quick-start) pour le guide pas à pas manuel.

> **exe vs start.bat** — les deux sont pris en charge et s'adressent à des publics différents :
> - **Installateur exe** — pour les utilisateurs finaux : double-cliquez pour installer, entrée dans le menu Démarrer, mise à jour auto dans l'app, pas besoin de Node.js.
> - **start.bat** — pour les développeurs / bricoleurs : pipeline transparent `npm install` → `vite build` → `electron .`, éditer-et-exécuter, nécessite Node.js.

---

## Démarrage rapide

**Prérequis :** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # développement (rechargement à chaud)
npm run build    # frontend de production
npm start        # lancer Electron
```

Ou exécutez `start.bat` à la racine du dépôt sur Windows.

### Configurer le fournisseur

1. Après le lancement, cliquez sur **Models** dans la barre latérale.
2. Ajoutez un fournisseur (nom / URL d'API / clé API).
3. Cliquez sur **Fetch models** pour récupérer la liste des modèles disponibles.
4. Revenez au chat et commencez à discuter.

### Activer le mode Ask

1. Ouvrez **Paramètres - Agent & Sécurité**.
2. Définissez le mode de permission de l'agent sur **Ask**.
3. Confirmez que la racine de l'espace de travail est le dossier où vous voulez que l'agent puisse lire/écrire.
4. Gardez **Yolo** désactivé sauf si vous voulez un accès non restreint.

### Exécuter votre première tâche agent

1. Ouvrez un nouveau chat.
2. Demandez : `Liste les fichiers de ce projet et résume ce que fait l'application.`
3. Revoyez chaque appel d'outil proposé. Approuvez les lectures sûres ; rejetez toute demande inattendue.
4. Consultez la trace de raisonnement en direct et la réponse finale.

---

## Fonctionnalités

**Labels de statut :** `Stable` = prêt pour l'usage quotidien, `Beta` = utilisable avec des aspérités connues, `Experimental` = nouveau/comportement avancé pouvant changer, `Planned` = élément documenté du roadmap.

### Chat

| Fonctionnalité | Statut | Description |
|---|:---:|---|
| **Multi-fournisseur** | `Stable` | Couche d'adaptation unique ; ajouter un fournisseur = un seul fichier. Couvre OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Streaming concurrent** | `Stable` | Un chat stream pendant que vous continuez dans un autre. |
| **Curseur d'effort de réflexion** | `Beta` | Paramètres réels : série o d'OpenAI / gpt-5 / Claude via relay. Efficace seulement sur les modèles de raisonnement. |
| **Pièces jointes** | `Beta` | Fichiers texte en contexte ; images pour le multimodal (nécessite un modèle de vision). |
| **Repli des longs collés** | `Stable` | Centaines de lignes se replient auto en snippet dépliable (style ChatGPT). |
| **Édition de messages** | `Stable` | Écraser + régénérer depuis n'importe quel point. |
| **Recherche de messages** | `Stable` | Avec surlignage sur tous les messages. |
| **Résumés de la barre latérale** | `Beta` | Phrases thématiques générées par le modèle, pas du texte copié. |

### Agent (appel de fonctions)

- `Beta` **16 outils intégrés** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) avec une boucle Plan-Act-Observe, trace de raisonnement en direct + liste de tâches, détection de boucle, timeouts par outil, budget d'itérations configurable (défaut 25 tours), et compression de contexte.
- `Experimental` **Planification hiérarchique** — génère automatiquement une décomposition de tâches pour les demandes complexes (inspiré de DS4).
- `Experimental` **Délégation de sous-agents** — sous-tâches indépendantes s'exécutent en parallèle via `delegate_task`.
- `Stable` **Modes de permission** — échelle ascendante par risque :

| Mode | Description | Sandbox |
|---|---|:---:|
| **Off** | Chat simple, pas d'outils | N/A |
| **Plan** | Outils en lecture seule (enquêter sans modifier) | - |
| **Ask** | Confirmer chaque action risquée (recommandé) | - |
| **Auto** | Tout exécuter, sans confirmations | Oui |
| **Yolo** | Permission totale, pas de sandbox | Non |

- `Stable` **Sandbox d'espace de travail** — `write_file`/`edit_file` sont refusés en dehors de la racine de l'espace de travail configuré ; `run_command` bloque les motifs destructifs. Configurable dans Paramètres - Agent & Sécurité.
- `Beta` **Compression de contexte** — résume auto l'historique plus ancien (paires appel/résultat d'outils préservées ; identifiants conservés à l'identique).
- `Beta` **Réparation d'appels d'outils** — répare auto JSON malformé, arguments manquants, clés non citées, et appels tronqués.

### Mémoire & Apprentissage

- `Beta` **Mémoire à long terme auto** — mémoires pertinentes injectées avant chaque tour ; faits clés extraits et sauvegardés automatiquement. Activable dans Paramètres - Agent.
- `Experimental` **Apprenant d'habitudes** — détecte les préférences récurrentes (ex. « toujours utiliser Claude ») et propose des skills auto-appliqués.
- `Beta` **Journal d'audit** — trace d'exécution agent par tour pour le débogage.

### Arène

- `Beta` **Arène multi-modèles** — un seul prompt, plusieurs modèles répondent **concurrently** ; votez pour le meilleur et un **classement ELO** se met à jour automatiquement. Les modèles sont notés **par intention** (codage / maths / traduction / résumé / général). *Aucune autre application de chat desktop local-first ne propose une arène multi-modèles intégrée avec ELO.*

### Skills & Extensibilité

| Composant | Format | Statut | Détails |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | À placer dans `<workspace>/.claude/skills/` ; livré avec `release-checklist` et `git-commit` |
| **Slash Commands** | `CMD.md` | `Stable` | 6 intégrés : `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 points du cycle de vie : PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Les serveurs MCP externes fusionnent automatiquement avec les outils intégrés |

### Personnalisation

| Paramètre | Statut | Description |
|---|:---:|---|
| **Paramètres avancés des modèles** | `Stable` | Tokens maximum, température, top_p, préfixe système personnalisé, titres auto par langue, effort de réflexion |
| **Arrière-plan personnalisé** | `Stable` | Image importée avec contrôles d'opacité / flou |
| **Personas** | `Stable` | Préréglages de prompts système, changeables par session |
| **Thèmes** | `Stable` | Clair / Sombre / Bleu / Verre / Rétro |
| **15 langues d'interface** | `Beta` | Anglais, Chinois (简/繁/文言), Japonais, Espagnol, Français, Allemand, Portugais, Russe, Ukrainien, Arabe (RTL), Hindi, Coréen |
| **Mise à jour auto** | `Beta` | L'installateur NSIS vérifie au lancement ; le portable aussi (installation manuelle) |
| **Suivi d'utilisation** | `Beta` | Journal par appel API avec tokens, coût, latence, taux de hit cache |

### Confidentialité

> **Toutes les données restent locales.** AetherAI ne collecte rien et ne téléverse rien vous concernant. Vos clés API, conversations et personas vivent dans une base de données SQLite locale. Les seules requêtes réseau sortantes vont vers les fournisseurs LLM que vous configurez.

---

## Structure du projet

```
app/
├── electron/              # main process (Node)
│   ├── database.js        # SQLite (sql.js) data layer — 14 tables
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
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Bureau | Electron 31 |
| Frontend | React 18.3 + TypeScript 5.5 |
| État | Zustand 4.5 |
| Build | Vite 5.4 + electron-builder |
| Base de données | sql.js (SQLite en mémoire, persisté sur disque) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Client JSON-RPC 2.0 stdio personnalisé |

---

## Remerciements

AetherAI se tient sur les épaules de ces projets — leurs idées ont façonné l'architecture et l'UX :

### Frameworks Agent

| Projet | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Modèle de permission agent, curseur de réflexion, visualisation d'appels d'outils, délégation de sous-agents, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Compression de contexte, détection de boucle d'appels d'outils, architecture de flux d'événements |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Budget d'itération, mémoire longue structurée, skills autonomes |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, compression de contexte, réparation d'appels d'outils |
| [DS4](https://github.com/antirez/ds4) | Décomposition hiérarchique de tâches |

### UI & UX

| Projet | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Méthodologie de composants cn() / cva copy-paste |
| [Magic UI](https://github.com/magicuidesign/magicui) | Motifs d'animation (shimmer, blur-fade) |

### Infrastructure

| Projet | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Normalisation multi-format fournisseur |
| [MCP](https://modelcontextprotocol.io) | La spec que parle l'agent d'AetherAI |
| [cc-switch](https://github.com/farion1231/cc-switch) | Mise en page du tableau de bord de stats d'utilisation |
| [new-api](https://github.com/QuantumNous/new-api) | Relay d'effort de raisonnement, suivi utilisation/coût |
| [Continue](https://github.com/continuedev/continue) | Config comme source de vérité, abstraction fournisseur |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Exécution agent multi-tours, exécution d'outils sandboxés |
| [Aider](https://github.com/Aider-AI/aider) | Boucle d'outils assistant codage LLM, intégration git |
| [Cline](https://github.com/cline/cline) | Agent intégré IDE, intégration MCP, UX de permissions |

---

## Contribuer

Toutes les contributions sont les bienvenues ! Qu'il s'agisse d'un correctif de bug, d'une demande de fonctionnalité, d'une amélioration de traduction ou d'une mise à jour de documentation — ouvrez un ticket ou soumettez une PR.

1. Forkez le dépôt
2. Créez une branche de fonctionnalité (`git checkout -b feat/ma-fonctionnalite`)
3. Committez vos changements (`git commit -am 'Ajouter fonctionnalite'`)
4. Poussez vers la branche (`git push origin feat/ma-fonctionnalite`)
5. Ouvrez une Pull Request

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour des directives détaillées.

---

## Licence

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Construit avec ❤️ en utilisant Electron + React + TypeScript

[⬆ Retour en haut](#aetherai)

</div>
