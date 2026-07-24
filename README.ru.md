<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**Локальный многопользовательский настольный клиент для общения с ИИ · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Статус: бета.** AetherAI — личный/хобби-проект. Работает, но возможны шероховатости. О багах сообщайте — см. [CONTRIBUTING.md](./CONTRIBUTING.md) и [SECURITY.md](./SECURITY.md).


AetherAI объединяет несколько провайдеров LLM (OpenAI / Claude / DeepSeek / локальные модели / любую совместимую с OpenAI конечную точку) в одном настольном приложении. Все данные хранятся локально — ваши API-ключи и переписки никогда не покидают ваш компьютер, за исключением обращений к настроенным вами провайдерам.

## 📑 Table of Contents

- [✨ Возможности](#-возможности)
  - [🖥️ Чат](#️-chat)
  - [🤖 Агент (вызов функций)](#-агент-вызов-функций)
  - [🔒 Конфиденциальность](#-конфиденциальность)
- [🚀 Быстрый старт](#-быстрый-старт)
- [📁 Структура проекта](#-структура-проекта)
- [🗺️ Roadmap](#️-roadmap)
- [🤝 Благодарности](#-благодарности)
- [📋 Changelog](#-changelog)
- [📄 Лицензия](#-лицензия)

---

## ✨ Возможности

### 🖥️ Чат

- **Единая абстракция провайдеров** — один слой адаптеров; добавление формата нового провайдера сводится к одному файлу. На данный момент поддерживается формат, совместимый с OpenAI (охватывает OpenRouter, Together, DeepSeek, OpenAI-шим Ollama, LM Studio и др.).
- **Параллельная потоковая передача в нескольких сессиях** — один чат может вести потоковую передачу, пока вы продолжаете общаться в другом.
- **Арена** — один запрос, отвечают сразу несколько моделей; голосуйте за лучший ответ, и рейтинг ELO обновляется автоматически.
- **Персоны** — готовые системные промпты, переключаемые для каждой сессии.
- **Вложения** — текстовые файлы добавляются как контекст; изображения передаются мультимодально (требуется модель с поддержкой зрения).
- **Свёртка длинных вставок** — вставка сотен строк автоматически сворачивается в раскрываемый фрагмент (в стиле ChatGPT).
- **Ползунок усилия размышления** — реальные параметры: для o-series от OpenAI → `reasoning_effort`, для Claude → `thinking.budget_tokens`.
- **Сводки в боковой панели** — заголовки формируются моделью как тематические фразы (например, «Совет по новому баннеру Eiyuu Angel»), а не как скопированный текст.
- **Расширенные настройки** — max tokens, temperature, top_p, пользовательский системный префикс, автоматические заголовки для каждого языка.
- **Своё фоновое изображение** — загрузите изображение с настройкой прозрачности и размытия.
- **15 языков интерфейса** — English (стандартный + перевёрнутый), 中文 (简体/繁體/文言文), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Темы** — Light / Dark / Blue / Glass / Retro.
- **Локальное хранение** — все данные в локальной базе SQLite; ничего не загружается наружу.

### 🤖 Агент (вызов функций)

- **13 встроенных инструментов** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) с циклом «План → Действие → Наблюдение» и живой трассировкой рассуждений.
- **Режимы разрешений агента** — Выкл / Спрашивать (подтверждать каждое рискованное действие) / Авто (разрешать всё) / План (только чтение). Повторяет модель разрешений агента для программирования.
- **Поддержка MCP** — подключайте внешние stdio MCP-серверы; их инструменты автоматически объединяются со встроенными.
- **Tool call repair** — LLMs иногда производят неверный JSON; цикл агента автоматически исправляет отсутствующие аргументы, незакавыченные ключи и усечённые вызовы перед выполнением.

---

## 🚀 Быстрый старт

### Предварительные требования
- Node.js 18+
- npm 9+

### Установка и запуск
```bash
cd app
npm install
npm run dev      # разработка (горячая перезагрузка)
npm run build    # сборка продакшен-фронтенда
npm start        # запуск Electron
```

Либо запустите `start.bat` в корне репозитория на Windows.

### Настройка первого провайдера
1. После запуска нажмите **Models** в боковой панели.
2. Добавьте провайдера (имя / API URL / API Key).
3. Нажмите **Fetch models**, чтобы получить список доступных моделей.
4. Вернитесь к чату и начните общение.

---

## 📁 Структура проекта

```
app/
├── electron/              # главный процесс (Node)
│   ├── database.js        # слой данных SQLite (sql.js)
│   ├── ipc/               # IPC-обработчики (chat / arena / session / mcp / ...)
│   ├── llm/               # абстракция LLM
│   │   ├── providerAdapter.js   # диспетчер по api_format
│   │   ├── openaiAdapter.js     # реализация, совместимая с OpenAI
│   │   ├── reasoning.js         # построитель параметра thinking-effort
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
│   ├── tools/             # реестр встроенных инструментов
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # MCP-клиент + менеджер
│   ├── main.js / preload.js
├── src/                   # рендерер (React + TS)
│   ├── store/index.ts     # глобальное состояние zustand
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 локалей) / тема / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, …)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## 🗺️ Roadmap

| Milestone | Status | Description |
|-----------|--------|-------------|
| v0.5 — Agent foundation | ✅ | Tool loop, planning, sandbox, permissions, hooks |
| v0.6 — Memory & Skills | ✅ | Auto memory, habit learner, slash commands, tool repair |
| v0.7 — Quality & Polish | 🔄 | Error boundaries, perf profiling, test coverage |
| v0.8 — Multi-model polish | ⬜ | Arena UX, ELO calibration, intent-based routing |
| v0.9 — Plugins & Extensibility | ⬜ | Skill marketplace, hook sharing, plugin SDK |
| v1.0 — Stable release | ⬜ | Signed installer, auto-update, changelog generation |

---

## 🤝 Благодарности

AetherAI стоит на плечах этих проектов — их идеи сформировали архитектуру и UX:

- [Claude Code](https://github.com/anthropics/claude-code) — модель разрешений агента, ползунок усиления размышления, визуализация вызовов инструментов, пустое состояние нового чата.
- [Continue](https://github.com/continuedev/continue) — декларативный подход «конфиг как источник истины», абстракция провайдеров, протокол вызова функций.
- [Dify](https://github.com/langgen/dify) — паттерны нормализации мультиформатных провайдеров.
- [Model Context Protocol](https://modelcontextprotocol.io) — спецификация MCP, на которой говорит агент AetherAI.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — методология копируемых компонентов cn() / cva.
- [Magic UI](https://github.com/magicuidesign/magicui) — паттерны анимации (потоковый текст, мерцание, blur-fade).
- [new-api](https://github.com/QuantumNous/new-api) — эталон преобразования reasoning-effort при ретрансляции.
- [OpenClaw](https://github.com/openclaw/openclaw) — доработка README и вдохновение для онбординга.
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

## 📄 Лицензия

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
