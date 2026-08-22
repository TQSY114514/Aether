<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="Aether" />

# Aether

### Local-first · Multi-modelo · Nativo de agentes

Chatea con cualquier modelo, ejecuta un agente de codificación seguro y compara modelos cara a cara — en tu escritorio o en tu terminal.

**Electron + Node.js · React + TypeScript · MCP · Agent · Skills**

[![GitHub downloads](https://img.shields.io/github/downloads/TQSY114514/Aether/total?style=flat-square&label=downloads)](https://github.com/TQSY114514/Aether/releases) [![npm downloads](https://img.shields.io/npm/dm/aetherai?style=flat-square&label=npm%20downloads)](https://www.npmjs.com/package/aetherai)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download)


[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>Las traducciones pueden ir desfasadas respecto a las versiones en inglés / chino simplificado.</sup>

</div>

---

> **Estado: Beta.** Aether es un proyecto solo/hobby. Funciona, pero espera
> algunas asperezas. Los informes de errores son bienvenidos — consulta
> [CONTRIBUTING.md](./CONTRIBUTING.md) y [SECURITY.md](./SECURITY.md).

> [!CAUTION]
> **El aviso de Windows SmartScreen es esperable.** Aether está creado por un estudiante desarrollador sin certificado comercial de firma de código, por lo que Windows 11 / Defender puede mostrar "Windows protegió tu PC" en el primer inicio.
> **La app es segura y de código abierto — revisa el código y luego haz clic en "Más información → Ejecutar de todas formas".**
> Si tu antivirus la pone en cuarentena, añade la carpeta de la app a las exclusiones del antivirus (consulta [Descarga](#descarga) para más detalles). Ningún dato sale de tu máquina excepto hacia los proveedores LLM que configures.

**Plataforma: solo Windows.** Los builds oficiales, las pruebas y el soporte se dirigen a Windows. macOS / Linux pueden compilarse desde el código fuente, pero no están soportados oficialmente, y no se planea la firma de código — espera un aviso de SmartScreen "editor desconocido" en el primer lanzamiento (consulta [Descarga](#descarga)).

**Una sola app para cada modelo.** OpenAI / Claude / DeepSeek / modelos locales / cualquier endpoint compatible con OpenAI — chatea, ejecuta un agente de codificación y compara modelos cara a cara en una arena multi-modelo con votación ELO.

**Local por diseño.** Las claves API y las conversaciones viven en una base de datos SQLite local y nunca salen de tu máquina — salvo hacia los proveedores que configures.

**Seguro por defecto.** El agente integrado se ejecuta dentro de un sandbox de workspace con una escalera de permisos: el acceso a archivos y comandos se confirma antes de que ocurra, y cada llamada de herramienta es auditable.

---

## Dos productos, un repositorio

Aether se distribuye como dos artefactos independientes que comparten el mismo runtime de agente:

- **Aether Desktop** — la GUI de Electron + React. Descárgala desde [GitHub Releases](#descarga--escritorio). Funciona out of the box.
- **Aether CLI / TUI / SDK** — agente headless, UI de terminal Ink v5 y SDK sin Electron. Instala con `npm install -g aetherai` ([instalación →](#descarga--cli--tui--sdk)). El binario del CLI es `aether`.

> **Aether comenzó como una aplicación de escritorio.** La CLI y la TUI se añadieron después y todavía se están poniendo al día. Si solo quieres un entorno de trabajo con IA que funcione, empieza por **Aether Desktop**. La capa CLI/TUI/SDK es experimental: las API y el comportamiento pueden cambiar, y algunas funciones pueden estar incompletas o ser poco fiables.

Ambos comparten `agentCore`, 42 herramientas, la memoria SQLite, el enrutamiento multi-modelo, los servidores MCP y el mismo almacén de sesiones. Un chat iniciado en la GUI puede continuarse en la TUI con `aether tui --session <id>` y viceversa.

---

## Qué hace diferente a Aether

Aether combina varias capacidades que normalmente se encuentran repartidas entre múltiples herramientas en una sola aplicación de escritorio local:

| Capacidad | Descripción | Madurez |
|---|---|:---:|
| **Chat multi-proveedor** | Cambia entre OpenAI, Claude, DeepSeek y cualquier endpoint compatible con OpenAI durante la conversación. | `Stable` |
| **Bucle de herramientas del Agente** | 42 herramientas integradas con bucle Plan-Act-Observe, sandboxing y escalera de permisos. | `Beta` |
| **Arena multi-modelo** | Envía un prompt a múltiples modelos, vota por el mejor y sigue los rankings ELO. | `Beta` |
| **Skills y extensibilidad** | Archivos `SKILL.md` plug-and-play, servidores MCP y sistema de 10 puntos de hook. | `Experimental` |
| **Memoria estructurada** | El agente recuerda preferencias y decisiones pasadas entre sesiones. | `Beta` |
| **Planificación jerárquica** | Las solicitudes complejas se descomponen automáticamente en subtareas paralelas. | `Experimental` |
| **Compacción de contexto** | Las conversaciones largas se resumen automáticamente sin perder pares de llamadas a herramientas. | `Beta` |
| **Privacidad local-first** | Conversaciones, claves y personas en SQLite local. Nada sale de tu máquina. | `Stable` |
| **15 idiomas de UI** | Incluyendo chino clásico (chino clásico) y árabe RTL. | `Beta` |
| **Terminal TUI** | Terminal interactivo Ink v5: flujo de sesiones, tarjetas de herramientas, revisión/reversión de diff, puerta de permisos por teclado, árbol de sesiones con `/fork`, `/memory` y reinyección de steering en tiempo de ejecución. | `Experimental` |
| **Headless CLI · RPC · SDK** | CLI de cuatro modos (disparo único / NDJSON / JSONL RPC / pipe), SDK sin Electron (`aetherai/sdk`) y protocolo JSONL invocable por máquinas. | `Experimental` |
| **Licencia MIT** | Totalmente open source. | `Stable` |

---

## Descarga

> Elige **uno**. Ambos productos comparten el mismo runtime de agente y el mismo almacén de sesiones.
> - **¿Solo quieres una app de chat de escritorio?** → [Aether Desktop](#descarga--escritorio)
> - **¿Quieres un agente de terminal / CI / SDK?** → [Aether CLI](#descarga--cli--tui--sdk)

### Descarga — Escritorio

**Windows — Instalador preconstruido (Recomendado para la mayoría de usuarios)**

Descarga el último [Release](https://github.com/TQSY114514/Aether/releases):

| Build | Descripción |
|---|---|
| **`aetherai-setup-x.y.z.exe`** | Instalador NSIS. Por usuario (sin admin), auto-update en la app. **Recomendado.** |
| **`aetherai-x.y.z.exe`** | Portable single-exe. Sin instalación, sin auto-update; solo ejecútalo. |

> El instalador muestra un aviso de SmartScreen "editor desconocido" en el primer lanzamiento — esperado para una app solo sin firmar. Todos los datos se quedan local.
>
> ⚠️ Algunos antivirus pueden poner en cuarentena el `electron.exe` desempaquetado durante el empaquetado porque la app no está firmada. Si el instalador es eliminado por tu AV, agrega una exclusión o usa el build portable.

### Descarga — CLI / TUI / SDK

**`aetherai`** es el paquete de npm. Agrupa el CLI headless, la TUI interactiva de Ink v5 y el SDK sin Electron en un solo binario.

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

`aether` y `aetherai` resuelven al mismo paquete. Fija una versión con `npm install -g aetherai@0.7.1` para que coincida con un release de escritorio.

> **Compartir datos con la GUI** — ambos productos usan la misma base de datos SQLite (`%APPDATA%/aetherai/aetherai.db`). Una sesión iniciada en la app de escritorio puede continuarse en la TUI y viceversa.

### Ejecutar desde el código fuente (desarrolladores / power users)

Si prefieres ejecutar desde el código fuente, o quieres modificar el código, usa `start.bat` (requiere [Node.js 22+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # Windows: instala deps, construye frontend, lanza Electron
```

Consulta [Inicio rápido](#-quick-start) para el paso a paso manual.

> **Dos productos o un solo árbol de código fuente** — ambos productos viven en el mismo repo. `app/electron/` alberga el runtime de agente compartido; `app/src/` es el renderer de escritorio; `app/cli.js` + `app/tui/` son los puntos de entrada del CLI/TUI. Los releases se marcan con git tags (`v*`) y de un solo tag sale tanto el instalador de escritorio como la publicación en npm.

---

## Inicio rápido

**Requisitos previos:** Node.js 22+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

O ejecuta `start.bat` en la raíz del repo en Windows.

### Prueba el terminal (no se necesita ventana de Electron)

```bash
cd app && npm install
node cli.js tui              # UI de terminal interactivo (Node ≥ 22; mejor en Windows Terminal)
node cli.js "hola"           # prompt de disparo único
echo "resume esto" | node cli.js  # stdin en pipe como prompt
node cli.js --mode json "x"  # flujo de eventos NDJSON (scripts/CI)
node cli.js tui --smoke      # smoke de la máquina de estados headless
```

### Configurar proveedor

1. Después del lanzamiento, haz clic en **Models** en la barra lateral.
2. Agrega un proveedor (nombre / URL de API / clave de API).
3. Haz clic en **Fetch models** para obtener la lista de modelos disponibles.
4. Vuelve al chat y empieza a hablar.

### Habilitar el modo Ask

1. Abre **Settings - Agent & Safety**.
2. Establece el modo de permiso del agente en **Ask**.
3. Confirma que el workspace root es la carpeta donde quieres que el agente lea/escriba.
4. Mantén **Yolo** deshabilitado a menos que quieras acceso sin restricciones.

### Ejecuta tu primera tarea de agente

1. Abre un nuevo chat.
2. Pregunta: `List the files in this project and summarize what the app does.`
3. Revisa cada llamada de herramienta propuesta. Aprueba las lecturas seguras; niega cualquier cosa inesperada.
4. Revisa la traza de razonamiento en vivo y la respuesta final.

---

## Características

**Etiquetas de estado:** `Stable` = listo para uso diario, `Beta` = usable con asperezas conocidas, `Experimental` = comportamiento nuevo/avanzado que puede cambiar, `Planned` = elemento documentado de la hoja de ruta.

### Chat

| Función | Estado | Descripción |
|---|:---:|---|
| **Multi-proveedor** | `Stable` | Capa adaptadora única; agregar un proveedor = un archivo. Cubre OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Streaming concurrente** | `Stable` | Un chat transmite mientras sigues hablando en otro. |
| **Deslizador de esfuerzo de pensamiento** | `Beta` | Parámetros reales: OpenAI o-series / gpt-5 / Claude vía relay. Solo efectivo en modelos de razonamiento. |
| **Adjuntos** | `Beta` | Archivos de texto como contexto; imágenes para multimodal (necesita un modelo de visión). |
| **Colapso de pegado largo** | `Stable` | Cientos de líneas se colapsan automáticamente en un fragmento expandible (estilo ChatGPT). |
| **Edición de mensajes** | `Stable` | Sobrescribir + regenerar desde cualquier punto. |
| **Búsqueda de mensajes** | `Stable` | Con resaltado en todos los mensajes. |
| **Resúmenes de la barra lateral** | `Beta` | Frases de tema generadas por el modelo, no texto copiado. |

### Agente (Function Calling)

- `Beta` **42 herramientas integradas** — operaciones de archivos (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), web (`web_search`, `web_fetch`), shell (`run_command`), git y GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), inteligencia de código (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), metainformación de agente (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — con bucle Plan-Act-Observe, traza de razonamiento en vivo + lista de tareas, detección de bucles, timeouts por herramienta, presupuesto de iteraciones configurable (25 rondas por defecto) y compacción de contexto.
- `Experimental` **Planificación jerárquica** — genera automáticamente el desglose de tareas para solicitudes complejas.
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
- `Beta` **Compacción de contexto** — resume automáticamente el historial más antiguo (los pares de llamada/resultado de herramienta se mantienen intactos; los identificadores se preservan verbatim).
- `Beta` **Reparación de llamadas a herramientas** — repara automáticamente JSON malformado, argumentos faltantes, claves sin comillas y llamadas truncadas.

### Memoria y Aprendizaje

- `Beta` **Memoria automática a largo plazo** — memorias relevantes inyectadas antes de cada turno; los hechos clave se extraen y guardan automáticamente. Activable/desactivable en Settings - Agent.
- `Experimental` **Aprendiz de hábitos** — detecta preferencias recurrentes (p. ej. "usar siempre Claude") y propone skills auto-aplicables.
- `Beta` **Registro de auditoría** — traza de ejecución del agente por turno para depuración.

### Arena

- `Beta` **Arena multi-modelo** — un prompt, múltiples modelos responden **de forma concurrente**; vota por el mejor y un **leaderboard ELO** se actualiza automáticamente. Los modelos se puntúan **por intención** (codificación / matemáticas / traducción / resumen / general). *Ninguna otra app de chat de escritorio local-first incluye una arena multi-modelo integrada con ELO.*

### Skills y Extensibilidad

| Componente | Formato | Estado | Detalles |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | Colócalos en `<workspace>/.claude/skills/`; incluye `release-checklist` y `git-commit` |
| **Slash Commands** | `CMD.md` | `Stable` | 6 integrados: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 puntos del ciclo de vida: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Los servidores MCP externos se fusionan automáticamente con las herramientas integradas |

### Personalización

| Ajuste | Estado | Descripción |
|---|:---:|---|
| **Configuración avanzada del modelo** | `Stable` | Max tokens, temperature, top_p, prefijo de sistema personalizado, títulos automáticos por idioma, esfuerzo de pensamiento |
| **Fondo personalizado** | `Stable` | Sube una imagen con controles de opacidad / desenfoque |
| **Personas** | `Stable` | Preajustes de system prompt, cambiables por sesión |
| **Temas** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 idiomas de UI** | `Beta` | Inglés, chino (simplificado / tradicional / clásico), japonés, español, francés, alemán, portugués, ruso, ucraniano, árabe (RTL), hindi, coreano |
| **Auto-update** | `Beta` | El instalador NSIS verifica al inicio; el portable también (instalación manual) |
| **Seguimiento de uso** | `Beta` | Registro por llamada a la API con tokens, costo, latencia, tasa de aciertos de caché |

### Privacidad

> **Todos los datos se quedan local.** Aether no recolecta ni sube nada sobre ti. Tus claves API, conversaciones y personas viven en una base de datos SQLite local. Las únicas peticiones de red salientes van hacia los proveedores LLM que configures.

---

## Terminal TUI, RPC y SDK

Más allá de la app de escritorio y de la CLI simple, Aether incluye una interfaz de terminal interactiva, un modo RPC JSONL invocable por máquinas y un SDK sin Electron. Los tres comparten el mismo núcleo de agente, memoria, personas, herramientas MCP y reglas de permiso que la versión de escritorio.

### Inicio rápido — formato dual

```bash
# Interactive terminal UI (Ink v5; requires Node ≥ 22)
node app/cli.js tui                # real terminal: type, approve tools, review diffs
node app/cli.js tui --smoke        # headless state-machine smoke (CI-safe, prints JSON)

# Single-shot prompt (same as before)
node app/cli.js "fix the failing test" --mode auto --max-iterations 30

# NDJSON event stream for scripts/CI (compat: --json-lines)
echo "summarize README.md" | node app/cli.js --mode json --model deepseek

# JSONL RPC loop over stdin/stdout
printf '{"type":"request","reqId":"c1","method":"listModels","params":{}}\n' \
  | node app/cli.js --mode rpc --db path\to\aetherai.db
```

Indicadores adicionales de headless: `--persona <id>` (persona + inyección de memoria), `--memory-trace` (informa del número de entradas de memoria inyectadas), `--skills` (JSON de propuestas de skills), `--setup-term` (escribe el perfil de Windows Terminal) y `--stdin` (entrada explícita por pipe).

### TUI (`aether tui`)

Agente de terminal interactivo (Ink v5; Node ≥ 22; mejor experiencia en Windows Terminal):

- **Sesiones**: renderizado en streaming de mensajes, árbol de sesiones con `/fork` (`session.parent_session_id`), `/sessions`, `/use <id>` para cambiar de historial
- **Herramientas y permisos**: tarjetas de llamadas de herramienta (color de estado / duración / resumen), revisión de diff (`Alt+v` para expandir, `Enter` para aceptar / `r` para revertir — restaura la instantánea previa a la escritura, funciona también en directorios que no son de git), puerta de permisos por teclado (`y` permite una vez / `a` permite siempre / `n` deniega, o `←→` para elegir), las herramientas de solo lectura se aprueban automáticamente
- **Modos de aprobación**: `Shift+Tab` recorre `manual → auto-edits → plan` (plan = planificación de solo lectura; al terminar, tres opciones deciden cómo implementarla)
- **Modo**: `Alt+m` alterna ask/plan/auto; `/persona <id>` cambia la personalidad (inyecta persona + prefijo de memoria)
- **Atajos de leader**: `Ctrl+X` y luego `m` selector de modelo / `n` nueva sesión / `l` lista de sesiones / `g` línea de tiempo / `r` checkpoint rewind / `q` salir
- **Paleta de comandos**: `Ctrl+P` o `x` (New chat / Model / Timeline / Export JSONL / Help / Quit)
- **Teclas reasignables**: `~/.config/aether/keybindings.json` (p. ej. `{ "char:?": null }` desactiva la tecla de ayuda `?`)
- **Persistencia de claves API**: `/apikey <provider> <key>` guarda en `auth.json` (las claves cifradas con safeStorage en la versión de escritorio no se pueden descifrar en headless; usa este comando o la variable de entorno `AETHER_API_KEY`)
- **Bucle de memoria y skills**: `/memory <palabra clave>` recupera, `--memory-trace` cuenta las entradas inyectadas, `/skills` + `/skill accept|dismiss <key>` (habitLearner → propuestas de skills)
- **Steering**: `Ctrl+C` durante la ejecución interrumpe → escribe el siguiente mensaje → se inyecta en el bucle actual (la cola muestra `steer:n`); `Tab` en ejecución pone directamente el siguiente en cola
- **Atajos de teclado**: doble `Esc` sale (o `/quit`), `Esc` limpia la entrada (el borrador pasa al historial), `?` pantalla de ayuda, `PgUp/PgDn`/rueda del ratón para desplazarse, la barra de estado muestra en tiempo real `approval/mode/model/tok/ctx`; todas las teclas en [docs/tui-keys.md](./docs/tui-keys.md)

### RPC (`aether --mode rpc`)

Protocolo JSONL invocable por máquinas sobre stdin/stdout: tramas `request` de entrada, tramas `event`/`result`/`error` de salida — un objeto JSON por línea, sin texto humano. Métodos: `run` (transmite eventos `text`/`tool`/`plan`/`status`), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. Referencia de tramas: [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

Agregación del núcleo del agente sin Electron para proyectos Node externos: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, tramas `rpc`, `sessionContext` (inyección de persona + memoria). Incluye declaraciones de tipos (`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Nativo de Windows

| Capacidad | Descripción |
|---|---|
| **Menú de bandeja** | Muestra/oculta la ventana, nueva sesión, **nueva tarea** (abre directamente TaskPanel); clic en la bandeja alterna mostrar/ocultar. |
| **Atajos globales** | `Ctrl+Alt+A` abre la ventana principal (la crea si no está iniciada); el resultado del registro se escribe en el log de inicio. |
| **Protocolo `aetherai://`** | `aetherai://new` / `chat` crea una sesión; `aetherai://tui` indica la forma de terminal; `aetherai://open/?path=<ruta codificada>` establece la carpeta como workspace y crea una sesión (cadena del menú contextual "Abrir con Aether"). |
| **Registro en el menú contextual** | `app/resources/register-protocol.reg` (importar como administrador tras sustituir `<AETHER_EXE>`): `.cs/.js/.ts/.tsx/.md/.json` + carpetas → clic derecho "Abrir con Aether". |
| **Configuración de terminal** | `app/resources/term/aether.ps1` (alias + lanza `aether tui`); `node app/cli.js --setup-term` escribe el perfil de Windows Terminal (esquemas de color oscuro/claro). |
| **Refuerzo del sandbox** | Defensa de rutas de Windows: rutas largas `\\?\`, UNC `\\server\share`, escape de reparse points/junctions, extensiones peligrosas como `.lnk/.scr/.msi`. |

---

## Estructura del proyecto

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

## Stack tecnológico

| Capa | Tecnología |
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

## Agradecimientos

Aether se apoya en los hombros de estos proyectos — sus ideas dieron forma a la arquitectura y a la UX:

### Frameworks de agentes

| Proyecto | Inspiración |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | Compacción de contexto, detección de bucles de llamadas a herramientas, arquitectura de flujo de eventos |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Presupuesto de iteraciones, memoria estructurada a largo plazo, skills autónomas, planificador cron, búsqueda de memoria FTS5 |
| [Evolver](https://github.com/EvoMap/evolver) | Motor de autoevolución, GEP (Genome Evolution Protocol) |
| [Aider](https://github.com/Aider-AI/aider) | Bucle de herramientas de asistente de codificación LLM, integración con git |
| [Cline](https://github.com/cline/cline) | Agente integrado en el IDE, integración MCP, UX de permisos |
| [OpenCode](https://github.com/sst/opencode) | UX de teclado/tema/permisos de la TUI, capa de política de caché de prompts |
| [OpenAI Codex](https://github.com/openai/codex) | Aislamiento del árbol de procesos en sandbox, UX de indicador de tiempo transcurrido y estado |

### UI y UX

| Proyecto | Inspiración |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Metodología de componentes copy-paste cn() |
| [Magic UI](https://github.com/magicuidesign/magicui) | Patrones de animación (shimmer, blur-fade) |
| [cc-switch](https://github.com/farion1231/cc-switch) | Diseño del panel de estadísticas de uso |

### Infraestructura

| Proyecto | Inspiración |
|---|---|
| [MCP](https://modelcontextprotocol.io) | El estándar que habla el agente de Aether |
| [new-api](https://github.com/QuantumNous/new-api) | Formas del parámetro reasoning-effort (lógica de conversión del relay) |

---

## Contribuir

¡Todas las contribuciones son bienvenidas! Ya sea un bug fix, una petición de función, una mejora de traducción o una actualización de documentación — abre un issue o envía un PR.

1. Haz fork del repo
2. Crea una rama de función (`git checkout -b feat/my-feature`)
3. Haz commit de tus cambios (`git commit -am 'Add feature'`)
4. Haz push a la rama (`git push origin feat/my-feature`)
5. Abre un Pull Request

Consulta [CONTRIBUTING.md](./CONTRIBUTING.md) para guías detalladas.

---

## Licencia

[MIT](./LICENSE) © 2025 Aether

---

<div align="center">

Hecho con ❤️ usando Electron + Node.js + React + TypeScript

[⬆ Volver arriba](#aether)

</div>
