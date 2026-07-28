<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)


---

> **Статус: бета.** AetherAI — особистий/хобі-проєкт. Працює, але можливі шероховатості. Про баги повідомляйте — див. [CONTRIBUTING.md](./CONTRIBUTING.md) і [SECURITY.md](./SECURITY.md).


AetherAI об'єднує кількох провайдерів LLM (OpenAI / Claude / DeepSeek / локальні моделі / будь-яку OpenAI-сумісну кінцеву точку) в один десктопний застосунок. Усе зберігається локально — ваші API-ключі та розмови ніколи не залишають ваш пристрій, окрім як до налаштованих вами провайдерів.

## 📑 Table of Contents

- [🎯 Що відрізняє AetherAI](#-що-відрізняє-aetherai)
- [✨ Можливості](#-можливості)
  - [🖥️ Чат](#️-чат)
  - [🤖 Агент (виклик функцій)](#-агент-виклик-функцій)
  - [🧠 Пам'ять та навчання](#-памят-та-навчання)
  - [🏟️ Арена](#-арена)
  - [🛠️ Навички та розширюваність](#-навички-та-розширюваність)
  - [⚙️ Налаштування](#-налаштування)
  - [🔒 Приватність](#-приватнсть)
- [📸 Скріншоти](#-скріншоти)
- [📦 Завантаження](#-завантаження)
  - [Windows — Готова збірка](#windows--готова-збiрка-рекомендовано)
- [🚀 Швидкий старт](#-швидкий-старт)
  - [Передумови](#передумови)
  - [Встановлення та запуск](#встановлення-та-запуск)
  - [Увімкніть режим Ask](#увімкніть-режим-ask)
  - [Запустіть перше завдання агента](#запустіть-перше-завдання-агента)
- [📁 Структура проєкту](#-структура-проєкту)
- [🔑 Технологічний стек](#-технологічний-стек)
- [🤝 Внесок](#-внесок)
- [🤝 Подяки](#-подяки)
- [📄 Ліцензія](#-ліцензiя)

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

## 🎯 Що відрізняє AetherAI

AetherAI об'єднує кілька можливостей, які зазвичай розкидані по різних інструментах, в одному десктопному застосунку:

| Можливість | Опис | Зрілість |
|---|---|:---:|
| **Мульти-провайдер Чат** | Перемикатися між OpenAI, Claude, DeepSeek і будь-якою OpenAI-сумісною кінцевою точкою під час розмови. | `Stable` |
| **Цикл агента (виклик функцій)** | 16 вбудованих інструментів із циклом План→Дія→Спостереження, пісочниця, драбина дозволів. | `Beta` |
| **Мульти-модельна Арена** | Надішліть один запит кільком моделям, проголосуйте за найкращу, відстежуйте ELO-рейтинг. | `Beta` |
| **Навички та розширюваність** | `SKILL.md` файли на винос, MCP-сервери, 10-точкова система гачків. | `Experimental` |
| **Структурована пам'ять** | Агент запам'ятовує уподобання та минулі рішення між сесіями. | `Beta` |
| **Ієрархічне планування** | Складні запити автоматично розбиваються на паралельні підзадачі. | `Experimental` |
| **Згортання контексту** | Довгі розмови автоматично підсумовуються без втрати пар викликів інструментів. | `Beta` |
| **Локальна приватність** | Розмови, ключі, персони — у локальній SQLite. Нічого не залишає ваш пристрій. | `Stable` |
| **15 мов інтерфейсу** | Включаючи класичну китайську (文言) та арабську з RTL. | `Beta` |
| **Ліцензія MIT** | Повністю відкритий вихідний код. | `Stable` |

---

### 🧠 Пам'ять та навчання

- `Beta` **Автоматична довгострокова пам'ять** — релевантні спогади інжектуються перед кожним ходом; ключові факти вилучаються і зберігаються автоматично. Вмикається в Налаштування — Агент.
- `Experimental` **Вивчач звичок** — виявляє повторювані уподобання (напр. "завжди використовувати Claude") і пропонує автоматично застосовувані навички.
- `Beta` **Журнал аудиту** — трасування виконання агента по ходах для дебаггу.

### 🏟️ Арена

- `Beta` **Мульти-модельна арена** — один запит, кілька моделей відповідають **одночасно**; проголосуйте за найкращу, і **ELO-таблиця лідерів** оновлюється автоматично. Моделі оцінюються **за наміром** (кодинг / математика / переклад / підсумок / загальне). *Жодний інший локальний десктопний застосунок чату не має вбудованої мульти-модельної арени з ELO.*

### 🛠️ Навички та розширюваність

| Компонент | Формат | Зрілість | Деталі |
|---|---|:---:|---|
| **Навички** | `SKILL.md` | `Experimental` | Перенесіть у `<робоча_папка>/.claude/skills/`; постачається з `release-checklist` і `git-commit` |
| **Слеш-команди** | `CMD.md` | `Stable` | 6 вбудованих: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Гачки** | Скрипт | `Experimental` | 10 точок життєвого циклу: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Зовнішні MCP-сервери автоматично зливаються з вбудованими інструментами |

### ⚙️ Налаштування

| Параметр | Зрілість | Опис |
|---|:---:|---|
| **Розширені налаштування моделі** | `Stable` | max tokens, temperature, top_p, власний системний префікс, автозаголовки за мовами, інтенсивність мислення |
| **Власний фон** | `Stable` | Завантажте зображення з контролем непрозорості / розмиття |
| **Персони** | `Stable` | Пресети системних промптів, перемикаються для кожної сесії |
| **Теми** | `Stable` | Світла / Темна / Синя / Скло / Ретро |
| **15 мов інтерфейсу** | `Beta` | Англійська, китайська (简/繁/文言), японська, іспанська, французька, німецька, португальська, російська, українська, арабська (RTL), хінді, корейська |
| **Автооновлення** | `Beta` | NSIS-інсталятор перевіряє при запуску; портативна теж (ручна установка) |
| **Відстеження використання** | `Beta` | Журнал кожного виклику API з токенами, вартістю, затримкою, відсотком попадання в кеш |

### 🔒 Приватність

> **Усі дані залишаються локальними.** AetherAI нічого не збирає і не завантажує про вас. Ваші API-ключі, розмови та персони зберігаються в локальній базі SQLite. Єдині вихідні мережеві запити йдуть до налаштованих вами LLM-провайдерів.

---

## 📸 Скріншоти

> Зробіть скріншоти у `assets/screenshots/` і оновіть шляхи нижче.

| Процес | Перегляд |
|---|:---:|
| Стрімінг чату | `assets/screenshots/chat-streaming.gif` — _TODO_ |
| Виконання інструментів агентом | `assets/screenshots/agent-tool-execution.gif` — _TODO_ |
| Голосування на арені | `assets/screenshots/arena-voting.gif` — _TODO_ |
| Налаштування провайдера | `assets/screenshots/provider-settings.png` — _TODO_ |

---

## 📦 Завантаження

### Windows — Готова збірка (рекомендовано)

Завантажте останню [Release](https://github.com/TQSY114514/AetherAI/releases):

| Збірка | Опис |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS-інсталятор. Для користувача (без admin), автооновлення всередині застосунку. **Рекомендовано.** |
| **`AetherAI-x.y.z.exe`** | Портативний один виконуваний файл. Без встановлення, без автооновлення; просто запустіть. |

> Інсталятор показує попередження SmartScreen «невідомий видавець» при першому запуску — очікувано для неідентифікованого хобі-застосунку. Усі дані залишаються локальними.

---

### Налаштуйте свого першого провайдера
1. Після запуску натисніть **Models** на бічній панелі.
2. Додайте провайдера (ім'я / API URL / API Key).
3. Натисніть **Fetch models**, щоб підтягнути список доступних моделей.
4. Поверніться до чату та почніть спілкуватися.

### Увімкніть режим Ask

1. Відкрийте **Налаштування — Агент і безпека**.
2. Встановіть режим дозволів агента на **Ask**.
3. Переконайтеся, що корінь робочої папки — та папка, в якій агент має читати/записувати.
4. Тримайте **Yolo** вимкненим, якщо вам не потрібен необмежений доступ.

### Запустіть перше завдання агента

1. Відкрийте новий чат.
2. Запитайте: `Список файлів у цьому проекті та підсумок того, що робить застосунок.`
3. Перевірте кожен запропонований виклик інструмента. Затверджуйте безпечні читання; відмовляйтеся від неочікуваного.
4. Перевірте ланцюжок міркувань у реальному часі та фінальну відповідь.

---

## 🔑 Технологічний стек

| Шар | Технологія |
|---|---|
| Десктоп | Electron 31 |
| Фронтенд | React 18.3 + TypeScript 5.5 |
| Стан | Zustand 4.5 |
| Збірка | Vite 5.4 + electron-builder |
| База даних | sql.js (SQLite в пам'яті, зберігається на диск) |
| LLM | OpenAI-сумісний + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Власний stdio JSON-RPC 2.0 клієнт |

---

## 🤝 Внесок

Ласкаво просимо до будь-якого внеску! Чи то виправлення помилок, запит нової функції, покращення перекладу або оновлення документації — відкрийте issue або надішліть PR.

1. Форкніть репозиторій
2. Створіть гілку для нової функції (`git checkout -b feat/my-feature`)
3. Зафіксуйте зміни (`git commit -am 'Add feature'`)
4. Відправте в гілку (`git push origin feat/my-feature`)
5. Відкрийте Pull Request

Див. [CONTRIBUTING.md](./CONTRIBUTING.md) для детальних рекомендацій.

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

## 📄 Ліцензія

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
