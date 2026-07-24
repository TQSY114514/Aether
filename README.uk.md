<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**Локальний багатомодельний десктопний AI-чат-клієнт · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Статус: бета.** AetherAI — особистий/хобі-проєкт. Працює, але можливі шероховатості. Про баги повідомляйте — див. [CONTRIBUTING.md](./CONTRIBUTING.md) і [SECURITY.md](./SECURITY.md).


AetherAI об'єднує кількох провайдерів LLM (OpenAI / Claude / DeepSeek / локальні моделі / будь-яку OpenAI-сумісну кінцеву точку) в один десктопний застосунок. Усе зберігається локально — ваші API-ключі та розмови ніколи не залишають ваш пристрій, окрім як до налаштованих вами провайдерів.

## 📑 Table of Contents

- [✨ Можливості](#-можливості)
  - [🖥️ Чат](#️-chat)
  - [🤖 Агент (виклик функцій)](#-агент-виклик-функцій)
  - [🔒 Приватність](#-privacy)
- [🚀 Швидкий старт](#-швидкий-старт)
- [📁 Структура проєкту](#-структура-проєкту)
- [🗺️ Roadmap](#️-roadmap)
- [🤝 Подяки](#-подяки)
- [📋 Changelog](#-changelog)
- [📄 Ліцензія](#-ліцензія)

---

## ✨ Можливості

### 🖥️ Чат

- **Абстракція провайдерів** — єдиний шар-адаптер; додати формат провайдера означає додати один файл. Нині OpenAI-сумісний (охоплює OpenRouter, Together, DeepSeek, OpenAI-шим Ollama, LM Studio, …).
- **Паралельний стрімінг сесій** — одна розмова може стрімити, поки ви продовжуєте спілкуватися в іншій.
- **Арена** — один запит, кілька моделей відповідають водночас; голосуйте за найкращу, і рейтингова таблиця ELO оновлюється автоматично.
- **Персони** — пресети системних промптів, перемикаються для кожної сесії.
- **Вкладення** — текстові файли додаються як контекст; зображення йдуть мультимодально (потрібна vision-модель).
- **Згортання довгих вставок** — вставка сотень рядків автоматично згортається у розгортуваний фрагмент (у стилі ChatGPT).
- **Повзунок інтенсивності мислення** — реальні параметри: OpenAI o-series → `reasoning_effort`, Claude → `thinking.budget_tokens`.
- **Підсумки на бічній панелі** — заголовки є згенерованими моделлю тематичними фразами (напр. "Порада щодо нового пулу Eiyuu Angel"), а не скопійованим текстом.
- **Розширені налаштування** — max tokens, temperature, top_p, власний системний префікс, автозаголовки для кожної мови.
- **Власний фон** — завантажте зображення з контролем непрозорості / розмиття.
- **15 мов інтерфейсу** — English (стандартна + догори ногами), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Теми** — Світла / Темна / Синя / Скло / Ретро.
- **Локальне зберігання** — усі дані в локальній базі SQLite; нічого не завантажується.

### 🤖 Агент (виклик функцій)

- **13 вбудованих інструментів** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) із циклом План→Дія→Спостереження та ланцюжком міркувань у реальному часі.
- **Режими дозволів агента** — Вимкнено / Запитувати (підтверджувати кожен ризикований інструмент) / Авто (дозволяти все) / План (лише читання). Дзеркально відображає модель дозволів агента-кодувальника.
- **Підтримка MCP** — під'єднуйте зовнішні stdio MCP-сервери; їхні інструменти автоматично зливаються із вбудованими.
- **Tool call repair** — LLMs іноді генерують некоректний JSON; цикл агента автоматично виправляє відсутні аргументи, нецитовані ключі та обрізані виклики перед виконанням.

---

## 🚀 Швидкий старт

### Передумови
- Node.js 18+
- npm 9+

### Встановлення та запуск
```bash
cd app
npm install
npm run dev      # розробка (гаряче перезавантаження)
npm run build    # збілдити продакшн-фронтенд
npm start        # запустити Electron
```

Або запустіть `start.bat` у корені репозиторію на Windows.

### Налаштуйте свого першого провайдера
1. Після запуску натисніть **Models** на бічній панелі.
2. Додайте провайдера (ім'я / API URL / API Key).
3. Натисніть **Fetch models**, щоб підтягнути список доступних моделей.
4. Поверніться до чату та почніть спілкуватися.

---

## 📁 Структура проєкту

```
app/
├── electron/              # головний процес (Node)
│   ├── database.js        # шар даних SQLite (sql.js)
│   ├── ipc/               # обробники IPC (chat / arena / session / mcp / ...)
│   ├── llm/               # абстракція LLM
│   │   ├── providerAdapter.js   # диспетчер за api_format
│   │   ├── openaiAdapter.js     # OpenAI-сумісна реалізація
│   │   ├── reasoning.js         # конструктор параметра thinking-effort
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
│   ├── tools/             # реєстр вбудованих інструментів
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # клієнт + менеджер MCP
│   ├── main.js / preload.js
├── src/                   # рендерер (React + TS)
│   ├── store/index.ts     # глобальний стан zustand
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

## 🤝 Подяки

AetherAI стоїть на плечах цих проєктів — їхні ідеї сформували архітектуру та UX:

- [Claude Code](https://github.com/anthropics/claude-code) — модель дозволів агента, повзунок інтенсивності мислення, візуалізація викликів інструментів, порожній стан нового чату.
- [Continue](https://github.com/continuedev/continue) — декларативний підхід «конфіг як єдине джерело істини», абстракція провайдерів, протокол виклику функцій.
- [Dify](https://github.com/langgen/dify) — шаблони нормалізації провайдерів для різних форматів.
- [Model Context Protocol](https://modelcontextprotocol.io) — специфікація MCP, якою розмовляє агент AetherAI.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — методологія копіюйте-вставте компонентів на основі cn() / cva.
- [Magic UI](https://github.com/magicuidesign/magicui) — патерни анімації (стрімінг тексту, мерехтіння, blur-fade).
- [new-api](https://github.com/QuantumNous/new-api) — еталон перетворення relay для reasoning-effort.
- [OpenClaw](https://github.com/openclaw/openclaw) — натхнення для полірування README та онбордингу.
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

## 📄 Ліцензія

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
