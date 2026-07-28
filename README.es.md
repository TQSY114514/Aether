<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दీ](./README.hi.md) · [한국어](./README.ko.md)


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
- [🗺️ ](#️-hoja-de-ruta)
- [🤝 Agradecimientos](#-agradecimientos)
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

