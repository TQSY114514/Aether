<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**Un client de chat IA de bureau, local-first et multi-modèles · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

> **Statut : bêta.** AetherAI est un projet personnel/passion. Il fonctionne, mais attendez-vous à des aspérités. Les rapports de bugs sont les bienvenus — voir [CONTRIBUTING.md](./CONTRIBUTING.md) et [SECURITY.md](./SECURITY.md).


AetherAI unifie plusieurs fournisseurs de LLM (OpenAI / Claude / DeepSeek / modèles locaux / tout point de terminaison compatible OpenAI) au sein d'une seule application de bureau. Tout est stocké localement — vos clés API et vos conversations ne quittent jamais votre machine, sauf pour les fournisseurs que vous configurez.

## ✨ Fonctionnalités

- **Abstraction multi-fournisseurs** — une seule couche d'adaptation ; ajouter un format de fournisseur ne représente qu'un seul fichier. Actuellement compatible OpenAI (couvre OpenRouter, Together, DeepSeek, la shim OpenAI d'Ollama, LM Studio, …).
- **Streaming multi-sessions simultané** — une conversation peut différer pendant que vous continuez à discuter dans une autre.
- **Arena** — une seule invite, plusieurs modèles répondent à la fois ; votez pour la meilleure réponse et un classement ELO se met à jour automatiquement.
- **Personas** — préréglages d'invites système, commutables par session.
- **Pièces jointes** — les fichiers texte sont injectés comme contexte ; les images passent en multimodal (nécessite un modèle de vision).
- **Repli des longs collés** — coller des centaines de lignes les replie automatiquement en un extrait dépliable (style ChatGPT).
- **Agent (appel de fonctions)** — 13 outils intégrés (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) avec une boucle Plan→Act→Observe et une trace de raisonnement en direct.
- **Modes de permission de l'agent** — Off / Ask (confirmer chaque outil risqué) / Auto (tout autoriser) / Plan (lecture seule). Reprend le modèle de permission d'un agent de codage.
- **Prise en charge MCP** — connectez des serveurs MCP stdio externes ; leurs outils fusionnent automatiquement avec les outils intégrés.
- **Curseur d'effort de réflexion** — vrais paramètres : série o d'OpenAI → `reasoning_effort`, Claude → `thinking.budget_tokens`.
- **Résumés de la barre latérale** — les titres sont des expressions thématiques générées par le modèle (par ex. « Conseils de tirage pour le nouveau Eiyuu Angel »), et non du texte copié.
- **Réglages avancés** — tokens maximum, température, top_p, préfixe système personnalisé, titres automatiques par langue.
- **Arrière-plan personnalisé** — importez une image avec des contrôles d'opacité / flou.
- **15 langues d'interface** — anglais (standard + à l'envers), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Thèmes** — Clair / Sombre / Bleu / Verre / Rétro.
- **Stockage local** — toutes les données dans une base de données SQLite locale ; rien n'est téléversé.

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
│   │   ├── autoMemory.js        # structured long-term memory (Hermes-inspired)
│   │   └── toolArgs.js          │ # tool-arg parsing
│   ├── tools/             # registre des outils intégrés
│   ├── mcp/               # client MCP + gestionnaire
│   ├── main.js / preload.js
├── src/                   # renderer (React + TS)
│   ├── store/index.ts     # état global zustand
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 locales) / theme / markdown
│   └── types/
└── package.json
```

## 🔒 Confidentialité

**Toutes les données sont stockées localement.** AetherAI ne collecte rien et ne téléverse aucune information vous concernant. Vos clés API, conversations et personas résident dans une base de données SQLite locale. Les seules requêtes réseau sortantes sont destinées aux fournisseurs de LLM que vous configurez.

> ⚠️ Avant de pousser vers GitHub, assurez-vous que `.gitignore` exclut `*.db`, `dist/`, `node_modules/`, `background.img` et tout `.env`.

## 🙏 Remerciements

AetherAI se tient sur les épaules de ces projets — leurs idées ont façonné l'architecture et l'expérience utilisateur :

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — le modèle de permission de l'agent, le curseur d'effort de réflexion, la visualisation des appels d'outils, l'état vide du nouveau chat.
- [Continue](https://github.com/continuedev/continue) — la configuration déclarative comme source de vérité, l'abstraction des fournisseurs, le protocole d'appel de fonctions.
- [Dify](https://github.com/langgen/dify) — les modèles de normalisation des fournisseurs multi-formats.
- [Model Context Protocol](https://modelcontextprotocol.io) — la spécification MCP que parle l'agent d'AetherAI.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — la méthodologie de composants à copier-coller cn() / cva.
- [Magic UI](https://github.com/magicuidesign/magicui) — les modèles d'animation (texte en flux, scintillement, fondu flou).
- [new-api](https://github.com/QuantumNous/new-api) — la référence de conversion du relais d'effort de raisonnement.
- [OpenClaw](https://github.com/openclaw/openclaw) — la peaufinage du README et l'inspiration pour l'intégration.
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

## 📄 Licence

MIT
