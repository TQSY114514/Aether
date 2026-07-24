<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**Un cliente de chat de IA de escritorio multi-modelo y local-first · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Estado: beta.** AetherAI es un proyecto personal/aficionado. Funciona, pero espera asperezas. Los reportes de errores son bienvenidos — consulta [CONTRIBUTING.md](./CONTRIBUTING.md) y [SECURITY.md](./SECURITY.md).


AetherAI unifica varios proveedores de LLM (OpenAI / Claude / DeepSeek / modelos locales / cualquier endpoint compatible con OpenAI) en una sola aplicación de escritorio. Todo se almacena localmente: tus claves API y conversaciones nunca salen de tu equipo excepto hacia los proveedores que configures.

## 📑 Table of Contents

- [✨ Funciones](#-funciones)
  - [🖥️ Chat](#️-chat)
  - [🤖 Agent (function calling)](#-agent-function-calling)
  - [🔒 Privacidad](#-privacidad)
- [🚀 Inicio rápido](#-inicio-rápido)
- [📁 Estructura del proyecto](#-estructura-del-proyecto)
- [🗺️ Hoja de ruta](#️-hoja-de-ruta)
- [🤝 Agradecimientos](#-agradecimientos)
- [📋 Changelog](#-changelog)
- [📄 Licencia](#-licencia)

---

## ✨ Funciones

### 🖥️ Chat

- **Abstracción multi-proveedor** — una única capa adaptadora; añadir un formato de proveedor significa tocar un solo archivo. Actualmente compatible con OpenAI (cubre OpenRouter, Together, DeepSeek, el shim OpenAI de Ollama, LM Studio, …).
- **Streaming multi-sesión simultáneo** — un chat puede emitir en streaming mientras sigues conversando en otro.
- **Arena** — un prompt, varios modelos responden a la vez; vota por el mejor y una tabla de clasificación ELO se actualiza automáticamente.
- **Personas** — preajustes de prompts del sistema, intercambiables por sesión.
- **Adjuntos** — los archivos de texto se inyectan como contexto; las imágenes van por canal multimodal (requiere un modelo de visión).
- **Colapso de pegado extenso** — pegar cientos de líneas se colapsa automáticamente en un fragmento expandible (estilo ChatGPT).
- **Deslizador de thinking-effort** — parámetros reales: OpenAI o-series → `reasoning_effort`, Claude → `thinking.budget_tokens`.
- **Resúmenes en la barra lateral** — los títulos son frases temáticas generadas por el modelo (p. ej. "Consejo para el nuevo pull de Eiyuu Angel"), no texto copiado.
- **Ajustes avanzados** — máx. de tokens, temperatura, top_p, prefijo de sistema personalizado, títulos automáticos por idioma.
- **Fondo personalizado** — sube una imagen con controles de opacidad / desenfoque.
- **15 idiomas de interfaz** — English (estándar e invertido), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Temas** — Light / Dark / Blue / Glass / Retro.

### 🤖 Agent (function calling)

- **13 herramientas integradas** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) con un bucle Plan→Act→Observe y traza de razonamiento en vivo.
- **Modos de permiso del Agent** — Off / Ask (confirmar cada herramienta de riesgo) / Auto (permitir todo) / Plan (solo lectura). Refleja el modelo de permisos de un agent de programación.
- **Soporte MCP** — conecta servidores MCP externos por stdio; sus herramientas se fusionan con las integradas automáticamente.
- **Tool call repair** — Los LLMs a veces producen JSON mal formado; el bucle del agente repara automáticamente argumentos faltantes, claves sin comillas y llamadas truncadas antes de la ejecución.

---

## 🚀 Inicio rápido

### Requisitos previos
- Node.js 18+
- npm 9+

### Instalar y ejecutar
```bash
cd app
npm install
npm run dev      # desarrollo (hot reload)
npm run build    # compilar el frontend de producción
npm start        # lanzar Electron
```

O ejecuta `start.bat` en la raíz del repositorio en Windows.

### Configura tu primer proveedor
1. Tras el arranque, haz clic en **Models** en la barra lateral.
2. Añade un proveedor (nombre / URL de API / API Key).
3. Haz clic en **Fetch models** para obtener la lista de modelos disponibles.
4. Vuelve al chat y empieza a hablar.

---

## 📁 Estructura del proyecto

```
app/
├── electron/              # proceso principal (Node)
│   ├── database.js        # capa de datos SQLite (sql.js)
│   ├── ipc/               # manejadores IPC (chat / arena / session / mcp / ...)
│   ├── llm/               # abstracción LLM
│   │   ├── providerAdapter.js   # dispatcher por api_format
│   │   ├── openaiAdapter.js     # implementación compatible con OpenAI
│   │   ├── reasoning.js         # constructor de parámetros thinking-effort
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
│   ├── tools/             # registro de herramientas integradas
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # cliente MCP + gestor
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

## 🗺️ Hoja de ruta

| Milestone | Status | Description |
|-----------|--------|-------------|
| v0.5 — Agent foundation | ✅ | Tool loop, planning, sandbox, permissions, hooks |
| v0.6 — Memory & Skills | ✅ | Auto memory, habit learner, slash commands, tool repair |
| v0.7 — Quality & Polish | 🔄 | Error boundaries, perf profiling, test coverage |
| v0.8 — Multi-model polish | ⬜ | Arena UX, ELO calibration, intent-based routing |
| v0.9 — Plugins & Extensibility | ⬜ | Skill marketplace, hook sharing, plugin SDK |
| v1.0 — Stable release | ⬜ | Signed installer, auto-update, changelog generation |

---

## 🤝 Agradecimientos

AetherAI se apoya en los hombros de estos proyectos: sus ideas dieron forma a la arquitectura y a la experiencia de usuario.

- [Claude Code](https://github.com/anthropics/claude-code) — el modelo de permisos del agent, el deslizador de thinking-effort, la visualización de llamadas a herramientas, el estado vacío de nuevo chat.
- [Continue](https://github.com/continuedev/continue) — configuración declarativa como única fuente de verdad, abstracción de proveedores, protocolo de function-calling.
- [Dify](https://github.com/langgen/dify) — patrones de normalización de proveedores multi-formato.
- [Model Context Protocol](https://modelcontextprotocol.io) — la especificación MCP que habla el agent de AetherAI.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — la metodología de componentes copiar y pegar con cn() / cva.
- [Magic UI](https://github.com/magicuidesign/magicui) — patrones de animación (texto en streaming, shimmer, blur-fade).
- [new-api](https://github.com/QuantumNous/new-api) — referencia de conversión de relay de reasoning-effort.
- [OpenClaw](https://github.com/openclaw/openclaw) — pulido del README e inspiración para la onboarding.
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

## 📄 Licencia

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
