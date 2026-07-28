<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दீ](./README.hi.md) · [한국어](./README.ko.md)


---

> **Statut : bêta.** AetherAI est un projet personnel/passion. Il fonctionne, mais attendez-vous à des aspérités. Les rapports de bugs sont les bienvenus — voir [CONTRIBUTING.md](./CONTRIBUTING.md) et [SECURITY.md](./SECURITY.md).


AetherAI unifie plusieurs fournisseurs de LLM (OpenAI / Claude / DeepSeek / modèles locaux / tout point de terminaison compatible OpenAI) au sein d'une seule application de bureau. Tout est stocké localement — vos clés API et vos conversations ne quittent jamais votre machine, sauf pour les fournisseurs que vous configurez.

## 📑 Table des matières

- [Ce qui rend AetherAI différent](#ce-qui-rend-aetherai-différent)
- [✨ Fonctionnalités](#-fonctionnalités)
  - [🖥️ Chat](#️-Chat)
  - [🤖 Agent (appel de fonctions)](#-agent-appel-de-fonctions)
  - [🧠 Mémoire & Apprentissage](#-mémoire--apprentissage)
  - [🏟️ Arène](#️-arène)
  - [🛠️ Skills & Extensibilité](#️-skills--extensibilité)
  - [⚙️ Personnalisation](#️-personnalisation)
  - [🔒 Confidentialité](#-confidentialité)
- [📸 Captures d'écran](#-captures-décran)
- [📦 Téléchargement](#-téléchargement)
  - [Windows — Préconstruit (Recommandé)](#windows--préconstruit-recommandé)
- [🚀 Démarrage rapide](#-démarrage-rapide)
  - [Configurer le fournisseur](#configurez-votre-premier-fournisseur)
  - [Activer le mode Ask](#activer-le-mode-ask)
  - [Exécuter votre première tâche agent](#exécutez-votre-première-tâche-agent)
- [📁 Structure du projet](#-structure-du-projet)
- [🔑 Tech Stack](#-tech-stack)
- [🤝 Contribuer](#-contribuer)
- [🤝 Remerciements](#-remerciements)
- [📄 Licence](#-licence)

---

## 🎯 Ce qui rend AetherAI différent

AetherAI combine plusieurs capacités qui sont généralement réparties sur plusieurs outils dans une seule application de bureau locale :

| Capacité | Description | Maturité |
|---|---|:---:|
| **Chat multi-fournisseurs** | Passez entre OpenAI, Claude, DeepSeek et n'importe quel point de terminaison compatible OpenAI en plein milieu d'une conversation. | `Stable` |
| **Boucle d'outils Agent** | 16 outils intégrés avec boucle Plan-Act-Observe, sandboxing, échelle de permissions. | `Beta` |
| **Arène multi-modèles** | Envoyez un seul prompt à plusieurs modèles, votez pour le meilleur, suivez les classements ELO. | `Beta` |
| **Skills & Extensibilité** | Fichiers `SKILL.md` à placer directement, serveurs MCP, système de 10 points d'extension. | `Expérimental` |
| **Mémoire structurée** | L'agent se souvient des préférences et décisions passées entre les sessions. | `Beta` |
| **Planification hiérarchique** | Les demandes complexes se décomposent automatiquement en sous-tâches parallèles. | `Expérimental` |
| **Compression de contexte** | Les longues conversations se résument automatiquement sans perdre les paires d'appels d'outils. | `Beta` |
| **Confidentialité locale-first** | Conversations, clés, personas dans SQLite local. Rien ne quitte votre machine. | `Stable` |
| **15 langues d'interface** | Y compris le chinois classique (文言) et l'arabe RTL. | `Beta` |
| **Licence MIT** | Entièrement open source. | `Stable` |

---

## ✨ Fonctionnalités

**Labels de statut :** `Stable` = prêt pour l'usage quotidien, `Beta` = utilisable avec des aspérités connues, `Expérimental` = nouveau/comportement avancé peut changer, `Planifié` = élément documenté du roadmap.

### 🖥️ Chat

| Fonctionnalité | Statut | Description |
|---|:---:|---|
| **Multi-fournisseur** | `Stable` | Couche d'adaptation unique ; ajouter un fournisseur = un seul fichier. Couvre OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Streaming concurrent** | `Stable` | Un chat stream pendant que vous continuez dans un autre. |
| **Curseur d'effort de réflexion** | `Beta` | Paramètres réels : série o / gpt-5 / Claude via relay. Seulement efficace sur les modèles de raisonnement. |
| **Pièces jointes** | `Beta` | Fichiers texte en contexte ; images pour le multimodal (nécessite un modèle de vision). |
| **Repli des longs collés** | `Stable` | Centaines de lignes se replient auto en snippet dépliable (style ChatGPT). |
| **Édition de messages** | `Stable` | Écraser + régénérer depuis n'importe quel point. |
| **Recherche de messages** | `Stable` | Avec surlignage sur tous les messages. |
| **Résumés de la barre latérale** | `Beta` | Phrases thématiques générées par le modèle, pas de texte copié. |

### 🤖 Agent (appel de fonctions)

- `Beta` **16 outils intégrés** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) avec une boucle Plan→Act→Observe, trace de raisonnement en direct + liste de tâches, détection de boucle, timeouts par outil, budget d'itérations configurable (défaut 25 tours), et compression de contexte.
- `Expérimental` **Planification hiérarchique** — génère automatiquement une décomposition de tâches pour les demandes complexes (inspiré de DS4).
- `Expérimental` **Délegation de sous-agents** — sous-tâches indépendantes s'exécutent en parallèle via `delegate_task`.
- `Stable` **Modes de permission** — échelle ascendante par risque :

| Mode | Description | Sandbox |
|---|---|:---:|
| **Off** | Chat simple, pas d'outils | N/A |
| **Plan** | Outils en lecture seule (enquêter sans modifier) | - |
| **Ask** | Confirmer chaque action risquée (recommandé) | - |
| **Auto** | Tout exécuter, sans confirmations | Oui |
| **Yolo** | Permission totale, pas de sandbox | Non |

- `Stable` **Sandbox d'espace de travail** — `write_file`/`edit_file` refusés en dehors de la racine de l'espace de travail configuré ; `run_command` bloque les motifs destructifs. Configurable dans Paramètres - Agent & Sécurité.
- `Beta` **Compression de contexte** — résume auto l'historique plus ancien (paires appel/outils préservées ; identifiants conservés à l'identique).
- `Beta` **Réparation d'appels d'outils** — répare auto JSON malformé, arguments manquants, clés non citées, appels tronqués.

### 🧠 Mémoire & Apprentissage

- `Beta` **Mémoire à long terme auto** — mémoires pertinentes injectées avant chaque tour ; faits clés extraits et sauvegardés automatiquement. Activable dans Paramètres - Agent.
- `Expérimental` **Apprenant d'habitudes** — détecte les préférences récurrentes (ex. "toujours utiliser Claude") et propose des skills auto-appliqués.
- `Beta` **Journal d'audit** — trace d'exécution agent par tour pour le débogage.

### 🏟️ Arène

- `Beta` **Arène multi-modèles** — un seul prompt, plusieurs modèles répondent **concurrently** ; votez pour le meilleur et un **classement ELO** se met à jour automatiquement. Les modèles sont notés **par intention** (codage / maths / traduction / résumé / général). *Aucune autre application de chat desktop local-first ne propose une arène multi-modèles intégrée avec ELO.*

### 🛠️ Skills & Extensibilité

| Composant | Format | Statut | Détails |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Expérimental` | À placer dans `<workspace>/.claude/skills/` ; livrée avec `release-checklist` et `git-commit` |
| **Slash Commands** | `CMD.md` | `Stable` | 6 intégrés : `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Expérimental` | 10 points du cycle de vie : PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Les serveurs MCP externes fusionnent automatiquement avec les outils intégrés |

### ⚙️ Personnalisation

| Paramètre | Statut | Description |
|---|:---:|---|
| **Paramètres avancés des modèles** | `Stable` | Tokens maximum, température, top_p, préfixe système personnalisé, titres auto par langue, effort de réflexion |
| **Arrière-plan personnalisé** | `Stable` | Image importée avec contrôles d'opacité / flou |
| **Personas** | `Stable` | Préréglages de prompts système, changeables par session |
| **Thèmes** | `Stable` | Clair / Sombre / Bleu / Verre / Rétro |
| **15 langues d'interface** | `Beta` | Anglais, Chinois (简/繁/文言), Japonais, Espagnol, Français, Allemand, Portugais, Russe, Ukrainien, Arabe (RTL), Hindi, Coréen |
| **Mise à jour auto** | `Beta` | Installateur NSIS vérifie au lancement ; portable aussi (installation manuelle) |
| **Suivi d'utilisation** | `Beta` | Journal par appel API avec tokens, coût, latence, taux de hit cache |

### 🔒 Confidentialité

> **Toutes les données restent locales.** AetherAI ne collecte rien et ne téléverse rien vous concernant. Vos clés API, conversations et personas vivent dans une base de données SQLite locale. Les seules requêtes réseau sortantes vont vers les fournisseurs LLM que vous configurez.

---

## 📸 Captures d'écran

> Capturez des captures d'écran sous `assets/screenshots/` et mettez à jour les chemins ci-dessous.

| Flux | Aperçu |
|---|:---:|
| Streaming de chat | `assets/screenshots/chat-streaming.gif` — _TODO_ |
| Exécution d'outils agent | `assets/screenshots/agent-tool-execution.gif` — _TODO_ |
| Vote arène | `assets/screenshots/arena-voting.gif` — _TODO_ |
| Paramètres fournisseur | `assets/screenshots/provider-settings.png` — _TODO_ |

---

## 📦 Téléchargement

### Windows — Préconstruit (Recommandé)

Téléchargez le dernier [Release](https://github.com/TQSY114514/AetherAI/releases) :

| Build | Description |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | Installeur NSIS. Utilisateur unique (pas d'admin), mises à jour automatiques dans l'app. **Recommandé.** |
| **`AetherAI-x.y.z.exe`** | Portable mono-exécutable. Pas d'installation, pas de mise à jour automatique ; lancez-le simplement. |

> L'installeur affiche un avertissement SmartScreen "éditeur inconnu" au premier lancement — attendu pour une application solo non signée. Toutes les données restent locales.

---

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+
- npm 9+

### Installer et lancer
```bash
cd app
npm install
npm run dev      # développement (rechargement à chaud)
npm run build    # construire le frontend de production
npm start        # lancer Electron
```

Ou exécutez `start.bat` à la racine du dépôt sur Windows.

### Configurez votre premier fournisseur
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

## 📁 Project Structure

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

## 🔑 Tech Stack

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

## 🤝 Contribuer

Toutes les contributions sont les bienvenues ! Qu'il s'agisse d'un correctif de bug, d'une demande de fonctionnalité, d'une amélioration de traduction ou d'une mise à jour de documentation — ouvrez un ticket ou soumettez une PR.

1. Forkez le dépôt
2. Créez une branche de fonctionnalité (`git checkout -b feat/ma-fonctionnalite`)
3. Committez vos changements (`git commit -am 'Ajouter fonctionnalité'`)
4. Poussez vers la branche (`git push origin feat/ma-fonctionnalite`)
5. Ouvrez une Pull Request

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour des directives détaillées.

---

## 🤝 Remerciements

AetherAI se tient sur les épaules de ces projets — leurs idées ont façonné l'architecture et l'UX :

### Frameworks Agent

| Projet | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Modèle de permission agent, curseur de réflexion, visualisation d'appels d'outils, delegation de sous-agents, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Compression de contexte, détection de boucle d'appels d'outils, architecture de flux d'événements |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Budget d'itération, mémoire longue structurée, skills autonomes |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, compression de contexte, réparation d'appels d'outils |
| [DS4](https://github.com/antirez/ds4) | Décomposition hiérarchique de tâches |

### UI & UX

| Projet | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Méthodologie cn() / cva copy-paste |
| [Magic UI](https://github.com/magicuidesign/magicui) | Motifs d'animation (shimmer, blur-fade) |

### Infrastructure

| Projet | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Normalisation multi-format fournisseur |
| [MCP](https://modelcontextprotocol.io) | Le langage que parle l'agent d'AetherAI |
| [cc-switch](https://github.com/farion1231/cc-switch) | Mise en page du tableau de bord de stats d'utilisation |
| [new-api](https://github.com/QuantumNous/new-api) | Relay d'effort de raisonnement, suivi utilisation/coût |
| [Continue](https://github.com/continuedev/continue) | Config comme source de vérité, abstraction fournisseur |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Exécution agent multi-tours, exécution d'outils sandboxés |
| [Aider](https://github.com/Aider-AI/aider) | Boucle d'outils assistant codage LLM, intégration git |
| [Cline](https://github.com/cline/cline) | Agent intégré IDE, intégration MCP, UX de permissions |

---

## 📄 Licence

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#-aetherai)

</div>
