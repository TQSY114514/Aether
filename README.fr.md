<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**Un client de chat IA de bureau, local-first et multi-modèles · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=social)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=social)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]() [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)]() [![electron](https://img.shields.io/badge/electron-31-4781ff.svg)]() [![i18n](https://img.shields.io/badge/i18n-15%20languages-blue.svg)]() [![tools](https://img.shields.io/badge/agent-16%20tools-green.svg)]() [![mcp](https://img.shields.io/badge/MCP-supported-purple.svg)]()

</div>

---

> **Statut : bêta.** AetherAI est un projet personnel/passion. Il fonctionne, mais attendez-vous à des aspérités. Les rapports de bugs sont les bienvenus — voir [CONTRIBUTING.md](./CONTRIBUTING.md) et [SECURITY.md](./SECURITY.md).


AetherAI unifie plusieurs fournisseurs de LLM (OpenAI / Claude / DeepSeek / modèles locaux / tout point de terminaison compatible OpenAI) au sein d'une seule application de bureau. Tout est stocké localement — vos clés API et vos conversations ne quittent jamais votre machine, sauf pour les fournisseurs que vous configurez.

## 📑 Table of Contents

- [✨ Fonctionnalités](#-fonctionnalités)
  - [🖥️ Chat](#️-chat)
  - [🤖 Agent (appel de fonctions)](#-agent-appel-de-fonctions)
  - [🔒 Confidentialité](#-confidentialité)
- [🚀 Démarrage rapide](#-démarrage-rapide)
- [📁 Structure du projet](#-structure-du-projet)
- [🤝 Remerciements](#-remerciements)
- [📄 Licence](#-licence)

---

## ✨ Fonctionnalités

### 🖥️ Chat

- **Abstraction multi-fournisseurs** — une seule couche d'adaptation ; ajouter un format de fournisseur ne représente qu'un seul fichier. Actuellement compatible OpenAI (couvre OpenRouter, Together, DeepSeek, la shim OpenAI d'Ollama, LM Studio, …).
- **Streaming multi-sessions simultané** — une conversation peut diffuser pendant que vous continuez à discuter dans une autre.
- **Arena** — une seule invite, plusieurs modèles répondent à la fois ; votez pour la meilleure réponse et un classement ELO se met à jour automatiquement.
- **Personas** — préréglages d'invites système, commutables par session.
- **Pièces jointes** — les fichiers texte sont injectés comme contexte ; les images passent en multimodal (nécessite un modèle de vision).
- **Repli des longs collés** — coller des centaines de lignes les replie automatiquement en un extrait dépliable (style ChatGPT).
- **Curseur d'effort de réflexion** — vrais paramètres : série o d'OpenAI → `reasoning_effort`, Claude → `thinking.budget_tokens`.
- **Résumés de la barre latérale** — les titres sont des expressions thématiques générées par le modèle (par ex. « Conseils de tirage pour le nouveau Eiyuu Angel »), et non du texte copié.
- **Réglages avancés** — tokens maximum, température, top_p, préfixe système personnalisé, titres automatiques par langue.
- **Arrière-plan personnalisé** — importez une image avec des contrôles d'opacité / flou.
- **15 langues d'interface** — anglais (standard + à l'envers), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Thèmes** — Clair / Sombre / Bleu / Verre / Rétro.

### 🤖 Agent (appel de fonctions)

- **13 outils intégrés** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) avec une boucle Plan→Act→Observe et une trace de raisonnement en direct.
- **Modes de permission de l'agent** — Off / Ask (confirmer chaque outil risqué) / Auto (tout autoriser) / Plan (lecture seule). Reprend le modèle de permission d'un agent de codage.
- **Prise en charge MCP** — connectez des serveurs MCP stdio externes ; leurs outils fusionnent automatiquement avec les outils intégrés.
- **Tool call repair** — Les LLMs produisent parfois du JSON mal formé ; la boucle de l'agent répare automatiquement les arguments manquants, les clés non citées et les appels tronqués avant l'exécution.

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

---

## 📁 Structure du projet

```
app/
├── electron/              # processus principal (Node)
│   ├── database.js        # couche de données SQLite (sql.js)
│   ├── ipc/               # gestionnaires IPC (chat / arena / session / mcp / ...)
│   ├── llm/               # abstraction LLM
│   │   ├── providerAdapter.js   # répartiteur par api_format
│   │   ├── openaiAdapter.js     # implémentation compatible OpenAI
│   │   ├── reasoning.js         # constructeur de paramètre d'effort de réflexion
│   │   ├── planning.js          # hierarchical task decomposition (DS4-inspired)
│   │   ├── toolLoop.js          # Plan→Act→Observe function-calling loop
│   │   ├── subAgent.js          # parallel sub-agent delegation
│   │   ├── compaction.js        # Context compaction (pair-preserving)
│   │   ├── autoMemory.js        # structured long-term memory (Hermes-inspired)
│   │   ├── habitLearner.js      # Recurring preference → auto-skills
│   │   ├── hooks.js             # 10-point extensibility hooks
│   │   ├── skills.js            # SKILL.md loader (Claude Code format)
│   │   ├── modelAdvisor.js      # Heuristic model suggestion
│   │   ├── toolCallRepair.js    # Malformed tool-call recovery
│   │   ├── auditLog.js          # Per-turn agent execution trace
│   │   └── ...
│   ├── tools/             # registre des outils intégrés
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # client MCP + gestionnaire
│   ├── main.js / preload.js
├── src/                   # renderer (React + TS)
│   ├── store/index.ts     # état global zustand
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 locales) / theme / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, …)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

