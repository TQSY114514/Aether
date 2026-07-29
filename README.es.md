<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Un workbench de IA de escritorio local-first y multi-modelo

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Proyecto solo / hobby` · `Licencia MIT`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Estado: Beta.** AetherAI es un proyecto solo/hobby. Funciona, pero espera
> algunas asperezas. Los informes de errores son bienvenidos — consulta
> [CONTRIBUTING.md](./CONTRIBUTING.md) y [SECURITY.md](./SECURITY.md).

Unifica múltiples proveedores de LLM — OpenAI / Claude / DeepSeek / modelos locales / cualquier endpoint compatible con OpenAI — en una sola aplicación de escritorio. Un agente que lee/escribe archivos y ejecuta comandos, un sandbox de workspace, arena multi-modelo con votación ELO, skills y 15 idiomas de UI. Todo se almacena localmente: tus claves API y conversaciones nunca salen de tu máquina excepto hacia los proveedores que configures.

---

## Qué hace diferente a AetherAI

AetherAI combina varias capacidades que normalmente se encuentran repartidas entre múltiples herramientas en una sola aplicación de escritorio local:

| Capacidad | Descripción | Madurez |
|---|---|:---:|
| **Chat multi-proveedor** | Cambia entre OpenAI, Claude, DeepSeek y cualquier endpoint compatible con OpenAI durante la conversación. | `Stable` |
| **Bucle de herramientas del Agente** | 16 herramientas integradas con bucle Plan-Act-Observe, sandboxing, escalera de permisos. | `Beta` |
| **Arena multi-modelo** | Envía un prompt a múltiples modelos, vota por el mejor, rastrea rankings ELO. | `Beta` |
| **Skills y extensibilidad** | Archivos `SKILL.md` plug-and-play, servidores MCP, sistema de 10 puntos de hook. | `Experimental` |
| **Memoria estructurada** | El agente recuerda preferencias y decisiones pasadas entre sesiones. | `Beta` |
| **Planificación jerárquica** | Las solicitudes complejas se descomponen automáticamente en subtareas paralelas. | `Experimental` |
| **Compacción de contexto** | Las conversaciones largas se resumen automáticamente sin perder pares tool-call/result. | `Beta` |
| **Privacidad local-first** | Conversaciones, claves, personas en SQLite local. Nada sale de tu máquina. | `Stable` |
| **15 idiomas de UI** | Incluyendo chino clásico (文言) y árabe RTL. | `Beta` |
| **Licencia MIT** | Totalmente open source. | `Stable` |

---

## Descarga

### Windows — Instalador preconstruido (Recomendado para la mayoría de usuarios)

Descarga el último [Release](https://github.com/TQSY114514/Aether/releases):

| Build | Descripción |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | Instalador NSIS. Per-user (sin admin), auto-update en-app. **Recomendado.** |
| **`AetherAI-x.y.z.exe`** | Portable single-exe. Sin install, sin auto-update; solo ejecútalo. |

> El instalador muestra una advertencia de SmartScreen "unknown publisher" en el primer lanzamiento — esperado para una app solo sin firmar. Todos los datos se quedan local.
>
> ⚠️ Algunos antivirus pueden poner en cuarentena el `electron.exe` desempaquetado durante el empaquetado porque la app no está firmada. Si el instalador es eliminado por tu AV, agrega una exclusión o usa el build portable.

### Ejecutar desde fuente (desarrolladores / power users)

Si prefieres ejecutar desde fuente, o quieres modificar el código, usa `start.bat` (requiere [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: instala deps, construye frontend, lanza Electron
```

Consulta [Inicio rápido](#-quick-start) para el paso a paso manual.

> **exe vs start.bat** — ambos están soportados y sirven a audiencias diferentes:
> - **Instalador exe** — para usuarios finales: doble clic para instalar, entrada en el menú Inicio, auto-update en-app, no necesita Node.js.
> - **start.bat** — para desarrolladores / tinkerers: pipeline transparente `npm install` → `vite build` → `electron .`, edita-y-ejecuta, requiere Node.js.

---

## Inicio rápido

**Requisitos previos:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # desarrollo (hot reload)
npm run build    # frontend de producción
npm start        # lanzar Electron
```

O ejecuta `start.bat` en la raíz del repo en Windows.

### Configurar proveedor

1. Después del lanzamiento, haz clic en **Models** en la barra lateral.
2. Agrega un proveedor (nombre / API URL / API Key).
3. Haz clic en **Fetch models** para obtener la lista de modelos disponibles.
4. Vuelve al chat y empieza a hablar.

### Habilitar modo Ask

1. Abre **Settings - Agent & Safety**.
2. Establece el modo de permiso del agente en **Ask**.
3. Confirma que el workspace root es la carpeta donde quieres que el agente lea/escriba.
4. Mantén **Yolo** deshabilitado a menos que quieras acceso sin restricciones.

### Ejecuta tu primera tarea de agente

1. Abre un nuevo chat.
2. Pregunta: `List the files in this project and summarize what the app does.`
3. Revisa cada tool call propuesto. Aprueba lecturas seguras; niega cualquier cosa inesperada.
4. Revisa la traza de razonamiento en vivo y la respuesta final.

---

## Características

**Etiquetas de estado:** `Stable` = listo para uso diario, `Beta` = usable con asperezas conocidas, `Experimental` = comportamiento nuevo/avanzado que puede cambiar, `Planned` = elemento de roadmap documentado.

### Chat

| Función | Estado | Descripción |
|---|:---:|---|
| **Multi-proveedor** | `Stable` | Capa adaptadora única; agregar un proveedor = un archivo. Cubre OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Streaming concurrente** | `Stable` | Un chat transmite mientras sigues hablando en otro. |
| **Slider de esfuerzo de pensamiento** | `Beta` | Params reales: OpenAI o-series / gpt-5 / Claude vía relay. Solo efectivo en modelos de razonamiento. |
| **Adjuntos** | `Beta` | Archivos de texto como contexto; imágenes para multimodal (necesita un modelo de visión). |
| **Colapso de pegado largo** | `Stable` | Cientos de líneas se colapsan automáticamente en un fragmento expandible (estilo ChatGPT). |
| **Edición de mensajes** | `Stable` | Sobrescribir + regenerar desde cualquier punto. |
| **Búsqueda de mensajes** | `Stable` | Con resaltado en todos los mensajes. |
| **Resúmenes de barra lateral** | `Beta` | Frases temáticas generadas por el modelo, no texto copiado. |

### Agente (Function Calling)

- `Beta` **16 herramientas integradas** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) con bucle Plan-Act-Observe, traza de razonamiento en vivo + lista de tareas, detección de bucles, timeouts por herramienta, presupuesto de iteraciones configurable (25 rondas por defecto) y compacción de contexto.
- `Experimental` **Planificación jerárquica** — genera automáticamente descomposición de tareas para solicitudes complejas (inspirado en DS4).
- `Experimental` **Delegación de sub-agente** — subtareas independientes se ejecutan en paralelo vía `delegate_task`.
- `Stable` **Modos de permiso** — escalera ascendente de riesgo:

| Modo | Descripción | Sandbox |
|---|---|:---:|
| **Off** | Chat plano, sin herramientas | N/A |
| **Plan** | Herramientas de solo lectura (investigar sin cambios) | - |
| **Ask** | Confirmar cada acción riesgosa (recomendado) | - |
| **Auto** | Ejecutar todo, sin confirmaciones | Sí |
| **Yolo** | Permiso total, sin sandbox | No |

- `Stable` **Sandbox de workspace** — `write_file`/`edit_file` se rechazan fuera del workspace root configurado; `run_command` bloquea patrones destructivos. Configurable en Settings - Agent & Safety.
- `Beta` **Compacción de contexto** — resume automáticamente el historial más antiguo (pares tool-call/result se mantienen intactos; identificadores preservados verbatim).
- `Beta` **Reparación de tool call** — repara automáticamente JSON malformado, args faltantes, keys sin comillas y calls truncadas.

### Memoria y Aprendizaje

- `Beta` **Memoria automática a largo plazo** — memorias relevantes inyectadas antes de cada turno; hechos clave extraídos y guardados automáticamente. Configurable en Settings - Agent.
- `Experimental` **Aprendiz de hábitos** — detecta preferencias recurrentes (ej. "siempre usar Claude") y propone skills auto-aplicables.
- `Beta` **Log de auditoría** — traza de ejecución del agente por turno para debugging.

### Arena

- `Beta` **Arena multi-modelo** — un prompt, múltiples modelos responden **concurrentemente**; vota por el mejor y un **leaderboard ELO** se actualiza automáticamente. Los modelos se puntúan **por intención** (coding / math / translation / summary / general). *Ninguna otra app de chat desktop local-first incluye una arena multi-modelo con ELO integrada.*

### Skills y Extensibilidad

| Componente | Formato | Estado | Detalles |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | Drop en `<workspace>/.claude/skills/`; incluye `release-checklist` y `git-commit` |
| **Slash Commands** | `CMD.md` | `Stable` | 6 integrados: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 puntos de ciclo de vida: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Servidores MCP externos se fusionan con las herramientas integradas automáticamente |

### Personalización

| Ajuste | Estado | Descripción |
|---|:---:|---|
| **Configuración avanzada de modelo** | `Stable` | Max tokens, temperature, top_p, prefijo de sistema personalizado, títulos auto por idioma, esfuerzo de pensamiento |
| **Fondo personalizado** | `Stable` | Sube imagen con controles de opacidad / blur |
| **Personas** | `Stable` | Preajustes de system prompt, cambiables por sesión |
| **Temas** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 idiomas de UI** | `Beta` | Inglés, chino (简/繁/文言), japonés, español, francés, alemán, portugués, ruso, ucraniano, árabe (RTL), hindi, coreano |
| **Auto-update** | `Beta` | El instalador NSIS verifica al inicio; el portable también (instalación manual) |
| **Seguimiento de uso** | `Beta` | Log por llamada API con tokens, costo, latencia, tasa de cache hit |

### Privacidad

> **Todos los datos se quedan local.** AetherAI no recolecta ni sube nada sobre ti. Tus claves API, conversaciones y personas viven en una base de datos SQLite local. Las únicas peticiones de red saliente van hacia los proveedores LLM que configures.

---

## Estructura del proyecto

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

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Desktop | Electron 31 |
| Frontend | React 18.3 + TypeScript 5.5 |
| State | Zustand 4.5 |
| Build | Vite 5.4 + electron-builder |
| Database | sql.js (SQLite in-memory, persistido en disco) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |

---

## Agradecimientos

AetherAI se apoya en los hombros de estos proyectos — sus ideas dieron forma a la arquitectura y la UX:

### Agent frameworks

| Project | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent permission model, thinking slider, tool-call visualization, sub-agent delegation, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Context compaction, tool-call loop detection, event-stream architecture |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Iteration budget, structured long-term memory, autonomous skills |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, context compression, tool-call repair |
| [DS4](https://github.com/antirez/ds4) | Hierarchical task decomposition |

### UI & UX

| Project | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva copy-paste component methodology |
| [Magic UI](https://github.com/magicuidesign/magicui) | Animation patterns (shimmer, blur-fade) |

### Infrastructure

| Project | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Multi-format provider normalization |
| [MCP](https://modelcontextprotocol.io) | The spec AetherAI's agent speaks |
| [cc-switch](https://github.com/farion1231/cc-switch) | Usage-stats dashboard layout |
| [new-api](https://github.com/QuantumNous/new-api) | Reasoning-effort relay, usage/cost tracking |
| [Continue](https://github.com/continuedev/continue) | Config-as-source-of-truth, provider abstraction |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Multi-turn agent execution, sandboxed tool execution |
| [Aider](https://github.com/Aider-AI/aider) | LLM coding-assistant tool loop, git integration |
| [Cline](https://github.com/cline/cline) | IDE-embedded agent, MCP integration, permission UX |

---

## Contribuir

¡Todas las contribuciones son bienvenidas! Ya sea un bug fix, feature request, mejora de traducción o actualización de documentación — abre un issue o envía un PR.

1. Fork del repo
2. Crea una feature branch (`git checkout -b feat/my-feature`)
3. Commit de tus cambios (`git commit -am 'Add feature'`)
4. Push a la branch (`git push origin feat/my-feature`)
5. Abre un Pull Request

Consulta [CONTRIBUTING.md](./CONTRIBUTING.md) para guías detalladas.

---

## Licencia

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Volver arriba](#aetherai)

</div>
