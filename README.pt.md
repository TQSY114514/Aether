<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**Um cliente de chat de IA para desktop, local-first e multi-modelo · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Status: beta.** AetherAI é um projeto pessoal/hobby. Funciona, mas espere arestas. Relatórios de bugs são bem-vindos — veja [CONTRIBUTING.md](./CONTRIBUTING.md) e [SECURITY.md](./SECURITY.md).


O AetherAI unifica múltiplos provedores de LLM (OpenAI / Claude / DeepSeek / modelos locais / qualquer endpoint compatível com OpenAI) em um único aplicativo de desktop. Tudo é armazenado localmente — suas chaves de API e conversas nunca saem da sua máquina, exceto para os provedores que você configurar.

## 📑 Table of Contents

- [✨ Recursos](#-recursos)
  - [🖥️ Chat](#️-chat)
  - [🤖 Agente (function calling)](#-agente-function-calling)
  - [🔒 Privacidade](#-privacidade)
- [🚀 Início rápido](#-início-rápido)
- [📁 Estrutura do projeto](#-estrutura-do-projeto)
- [🗺️ Roteiro](#️-roteiro)
- [🤝 Agradecimentos](#-agradecimentos)
- [📋 Changelog](#-changelog)
- [📄 Licença](#-licença)

---

## ✨ Recursos

### 🖥️ Chat

- **Abstração multi-provedor** — uma única camada de adaptador; adicionar um formato de provedor significa um arquivo. Atualmente compatível com OpenAI (cobre OpenRouter, Together, DeepSeek, o shim OpenAI do Ollama, LM Studio, …).
- **Streaming multi-sessão concorrente** — um chat pode transmitir enquanto você continua conversando em outro.
- **Arena** — um prompt, múltiplos modelos respondem de uma vez; vote no melhor e um ranking ELO é atualizado automaticamente.
- **Personas** — predefinições de system prompt, alternáveis por sessão.
- **Anexos** — arquivos de texto são injetados como contexto; imagens seguem por via multimodal (exige um modelo de visão).
- **Colapso de colagens longas** — colar centenas de linhas recolhe automaticamente em um trecho expansível (estilo ChatGPT).
- **Controle deslizante de esforço de raciocínio** — parâmetros reais: série-o da OpenAI → `reasoning_effort`, Claude → `thinking.budget_tokens`.
- **Resumos na barra lateral** — os títulos são frases de tópico geradas pelo modelo (ex. "Conselho sobre novo pull de Eiyuu Angel"), e não texto copiado.
- **Configurações avançadas** — max tokens, temperature, top_p, prefixo de sistema personalizado, títulos automáticos por idioma.
- **Plano de fundo personalizado** — envie uma imagem com controles de opacidade / desfoque.
- **15 idiomas de UI** — English (padrão + de cabeça para baixo), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Temas** — Light / Dark / Blue / Glass / Retro.

### 🤖 Agente (function calling)

- **13 ferramentas integradas** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) com um loop Plan→Act→Observe e rastro de raciocínio ao vivo.
- **Modos de permissão do agente** — Off / Ask (confirmar cada ferramenta arriscada) / Auto (permitir todas) / Plan (somente leitura). Espelha o modelo de permissões de um agente de programação.
- **Suporte a MCP** — conecte servidores MCP stdio externos; as ferramentas deles se mesclam automaticamente às integradas.
- **Tool call repair** — Os LLMs às vezes produzem JSON malformado; o loop do agente repara automaticamente argumentos faltantes, chaves não citadas e chamadas truncadas antes da execução.

---

## 🚀 Início rápido

### Pré-requisitos
- Node.js 18+
- npm 9+

### Instalar e executar
```bash
cd app
npm install
npm run dev      # desenvolvimento (hot reload)
npm run build    # compilar o frontend de produção
npm start        # iniciar o Electron
```

Ou execute `start.bat` na raiz do repositório no Windows.

### Configure seu primeiro provedor
1. Após a inicialização, clique em **Models** na barra lateral.
2. Adicione um provedor (nome / URL da API / API Key).
3. Clique em **Fetch models** para obter a lista de modelos disponíveis.
4. Volte ao chat e comece a conversar.

---

## 📁 Estrutura do projeto

```
app/
├── electron/              # processo principal (Node)
│   ├── database.js        # camada de dados SQLite (sql.js)
│   ├── ipc/               # handlers IPC (chat / arena / session / mcp / ...)
│   ├── llm/               # abstração de LLM
│   │   ├── providerAdapter.js   # despachante por api_format
│   │   ├── openaiAdapter.js     # implementação compatível com OpenAI
│   │   ├── reasoning.js         # construtor de parâmetros de esforço de raciocínio
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
│   ├── tools/             # registro de ferramentas integradas
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # cliente + gerenciador MCP
│   ├── main.js / preload.js
├── src/                   # renderer (React + TS)
│   ├── store/index.ts     # estado global zustand
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

## 🗺️ Roteiro

| Milestone | Status | Description |
|-----------|--------|-------------|
| v0.5 — Agent foundation | ✅ | Tool loop, planning, sandbox, permissions, hooks |
| v0.6 — Memory & Skills | ✅ | Auto memory, habit learner, slash commands, tool repair |
| v0.7 — Quality & Polish | 🔄 | Error boundaries, perf profiling, test coverage |
| v0.8 — Multi-model polish | ⬜ | Arena UX, ELO calibration, intent-based routing |
| v0.9 — Plugins & Extensibility | ⬜ | Skill marketplace, hook sharing, plugin SDK |
| v1.0 — Stable release | ⬜ | Signed installer, auto-update, changelog generation |

---

## 🤝 Agradecimentos

O AetherAI apoia-se nos ombros destes projetos — suas ideias moldaram a arquitetura e a experiência do usuário:

- [Claude Code](https://github.com/anthropics/claude-code) — modelo de permissão do agente, controle deslizante de esforço de raciocínio, visualização de chamadas de ferramentas, estado vazio de novo chat.
- [Continue](https://github.com/continuedev/continue) — configuração declarativa como fonte da verdade, abstração de provedor, protocolo de function calling.
- [Dify](https://github.com/langgen/dify) — padrões de normalização de provedor multi-formato.
- [Model Context Protocol](https://modelcontextprotocol.io) — a especificação MCP que o agente do AetherAI fala.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — a metodologia de componentes copiar-e-colar com cn() / cva.
- [Magic UI](https://github.com/magicuidesign/magicui) — padrões de animação (texto em streaming, shimmer, blur-fade).
- [new-api](https://github.com/QuantumNous/new-api) — referência de conversão de retransmissão de esforço de raciocínio.
- [OpenClaw](https://github.com/openclaw/openclaw) — polimento do README + inspiração para o onboarding.
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

---

## 📋 Changelog

### v0.5.1

**Agent system upgrade**
- Tool execution modes: `parallel` vs `sequential` per-tool (OpenClaw pattern)
- Tool lifecycle hooks: `prepareArguments` → `beforeToolCall` → execute → `afterToolCall`
- Tool call repair: auto-fix malformed JSON / missing args / truncated calls
- Hook system extended: `SessionStart`, `SessionEnd`, `SubagentStop`
- Context compaction: pair-preserving split (tool-call/result pairs kept intact)
- Slash commands: 6 built-in commands (`/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate`)
- Lazy-loaded i18n: 13 language files loaded on demand

---

## 📄 Licença

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
