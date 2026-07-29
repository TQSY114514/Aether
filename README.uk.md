<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Локальний, мульти-модельний десктопний AI-робочий стіл

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Статус: Beta.** AetherAI — сольний/хобі-проєкт. Працює, але можливі шероховатості. Про баги повідомляйте — див. [CONTRIBUTING.md](./CONTRIBUTING.md) і [SECURITY.md](./SECURITY.md).

Об'єднайте кількох LLM-провайдерів — OpenAI / Claude / DeepSeek / локальні моделі / будь-яку OpenAI-сумісну кінцеву точку — в один десктопний застосунок. Агент, що читає/пише файли та виконує команди, пісочниця робочої папки, мульти-модельна арена з ELO-голосуванням, навички та 15 мов інтерфейсу. Усе зберігається локально: API-ключі та розмови ніколи не залишають ваш пристрій, окрім як до налаштованих вами провайдерів.

---

## Що відрізняє AetherAI

AetherAI поєднує кілька можливостей, які зазвичай розкидані по різних інструментах, в одному локальному десктопному застосунку:

| Можливість | Опис | Зрілість |
|---|---|:---:|
| **Мульти-провайдер чат** | Перемикатися між OpenAI, Claude, DeepSeek і будь-якою OpenAI-сумісною кінцевою точкою під час розмови. | `Stable` |
| **Цикл інструментів агента** | 16 вбудованих інструментів із циклом План-Дія-Спостереження, пісочниця, драбина дозволів. | `Beta` |
| **Мульти-модельна арена** | Надішліть один запит кільком моделям, проголосуйте за найкращу, відстежуйте ELO-рейтинг. | `Beta` |
| **Навички та розширюваність** | `SKILL.md` файли на винос, MCP-сервери, 10-точкова система гачків. | `Experimental` |
| **Структурована пам'ять** | Агент пригадує уподобання та минулі рішення між сесіями. | `Beta` |
| **Ієрархічне планування** | Складні запити автоматично розбиваються на паралельні підзадачі. | `Experimental` |
| **Згортання контексту** | Довгі розмови автоматично підсумовуються без втрати пар викликів інструментів. | `Beta` |
| **Локальна приватність** | Розмови, ключі, персони — у локальній SQLite. Нічого не залишає ваш пристрій. | `Stable` |
| **15 мов інтерфейсу** | Включно з класичною китайською (文言) та арабською з RTL. | `Beta` |
| **Ліцензія MIT** | Повністю відкритий вихідний код. | `Stable` |

---

## Завантаження

### Windows — Готовий інсталятор (Рекомендовано для більшості користувачів)

Завантажте останній [Release](https://github.com/TQSY114514/AetherAI/releases):

| Збірка | Опис |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS-інсталятор. Для користувача (без admin), автооновлення всередині застосунку. **Рекомендовано.** |
| **`AetherAI-x.y.z.exe`** | Портативний один виконуваний файл. Без встановлення, без автооновлення; просто запустіть. |

> Інсталятор показує попередження SmartScreen «невідомий видавець» при першому запуску — очікувано для неідентифікованого сольного застосунку. Усі дані залишаються локальними.
>
> ⚠️ Деякі антивіруси можуть карантинувати розпакований `electron.exe` під час пакування, оскільки застосунок неідентифікований. Якщо інсталятор вилучено вашим AV, додайте виняток або використовуйте портативну збірку.

### Запуск із вихідного коду (розробники / досвідчені користувачі)

Якщо ви надаєте перевагу запуску з вихідного коду або хочете модифікувати код, використовуйте `start.bat` (потребує [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/AetherAI.git
cd AetherAI
start.bat        # Windows: встановлює залежності, збирає фронтенд, запускає Electron
```

Див. [Швидкий старт](#-quick-start) для покрокової інструкції вручну.

> **exe vs start.bat** — обидва варіанти підтримуються і орієнтовані на різну аудиторію:
> - **Інсталятор exe** — для кінцевих користувачів: подвійний клік для встановлення, запис у меню Пуск, in-app автооновлення, Node.js не потрібен.
> - **start.bat** — для розробників / допитливих: прозорий конвеєр `npm install` → `vite build` → `electron .`, редагуй-і-запускай, потребує Node.js.

---

## Швидкий старт

**Передумови:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # розробка (гаряче перезавантаження)
npm run build    # продакшн-фронтенд
npm start        # запустити Electron
```

Або запустіть `start.bat` у корені репозиторію на Windows.

### Налаштуйте провайдера

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
2. Запитайте: `Список файлів у цьому проєкті та підсумок того, що робить застосунок.`
3. Перевірте кожен запропонований виклик інструмента. Затверджуйте безпечні читання; відмовляйтеся від неочікуваного.
4. Перевірте ланцюжок міркувань у реальному часі та фінальну відповідь.

---

## Можливості

**Мітки статусу:** `Stable` = готовий для щоденного використання, `Beta` = придатний з відомими шероховатостями, `Experimental` = нова/просунута поведінка може змінюватися, `Planned` = задокументований пункт дорожньої карти.

### Чат

| Можливість | Статус | Опис |
|---|:---:|---|
| **Мульти-провайдер** | `Stable` | Єдиний шар-адаптер; додати провайдера = один файл. Охоплює OpenRouter, Together, DeepSeek, Ollama, LM Studio, … |
| **Паралельний стрімінг** | `Stable` | Одна розмова стрімить, поки ви продовжуєте спілкуватися в іншій. |
| **Повзунок інтенсивності мислення** | `Beta` | Реальні параметри: OpenAI o-series / gpt-5 / Claude через relay. Діє лише на моделях з міркуванням. |
| **Вкладення** | `Beta` | Текстові файли як контекст; зображення для мультимодальності (потрібна vision-модель). |
| **Згортання довгих вставок** | `Stable` | Сотні рядків автоматично згортаються у розгортуваний фрагмент (у стилі ChatGPT). |
| **Редагування повідомлень** | `Stable` | Перезапис + регенерація з будь-якої точки. |
| **Пошук повідомлень** | `Stable` | З підсвічуванням по всіх повідомленнях. |
| **Підсумки на бічній панелі** | `Beta` | Згенеровані моделлю тематичні фрази, а не скопійований текст. |

### Агент (Function Calling)

- `Beta` **16 вбудованих інструментів** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) із циклом План-Дія-Спостереження, ланцюжком міркувань у реальному часі + чеклистом завдань, виявленням циклів, таймаутами на інструмент, налаштовуваним бюджетом ітерацій (за замовчуванням 25 раундів) та згортанням контексту.
- `Experimental` **Ієрархічне планування** — автоматично генерує розбивку завдань для складних запитів (натхненно DS4).
- `Experimental` **Делегування підагентам** — незалежні підзадачі виконуються паралельно через `delegate_task`.
- `Stable` **Режими дозволів** — драбина зі зростаючим ризиком:

| Режим | Опис | Пісочниця |
|---|---|:---:|
| **Off** | Звичайний чат, без інструментів | Н/Д |
| **Plan** | Інструменти лише читання (дослідження без змін) | - |
| **Ask** | Підтверджувати кожну ризиковану дію (рекомендовано) | - |
| **Auto** | Виконувати все, без підтверджень | Так |
| **Yolo** | Повний дозвіл, без пісочниці | Ні |

- `Stable` **Пісочниця робочої папки** — `write_file`/`edit_file` відхиляються поза налаштованим коренем робочої папки; `run_command` блокує деструктивні патерни. Налаштовується в Налаштування — Агент і безпека.
- `Beta` **Згортання контексту** — автоматично підсумовує стару історію (пари виклик/результат інструментів зберігаються незмінними; ідентифікатори зберігаються дослівно).
- `Beta` **Відновлення викликів інструментів** — автоматично виправляє некоректний JSON, відсутні аргументи, нецитовані ключі та обрізані виклики.

### Пам'ять та навчання

- `Beta` **Автоматична довгострокова пам'ять** — релевантні спогади інжектуються перед кожним ходом; ключові факти вилучаються і зберігаються автоматично. Вмикається в Налаштування — Агент.
- `Experimental` **Вивчач звичок** — виявляє повторювані уподобання (напр. «завжди використовувати Claude») і пропонує автоматично застосовувані навички.
- `Beta` **Журнал аудиту** — трасування виконання агента по ходах для дебагу.

### Арена

- `Beta` **Мульти-модельна арена** — один запит, кілька моделей відповідають **одночасно**; голосуйте за найкращу, і **ELO-таблиця лідерів** оновлюється автоматично. Моделі оцінюються **за наміром** (кодинг / математика / переклад / підсумок / загальне). *Жодний інший локальний десктопний застосунок чату не має вбудованої мульти-модельної арени з ELO.*

### Навички та розширюваність

| Компонент | Формат | Статус | Деталі |
|---|---|:---:|---|
| **Навички** | `SKILL.md` | `Experimental` | Перенесіть у `<workspace>/.claude/skills/`; постачається з `release-checklist` і `git-commit` |
| **Слеш-команди** | `CMD.md` | `Stable` | 6 вбудованих: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Гачки** | Скрипт | `Experimental` | 10 точок життєвого циклу: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Зовнішні MCP-сервери автоматично зливаються з вбудованими інструментами |

### Налаштування

| Параметр | Статус | Опис |
|---|:---:|---|
| **Розширені налаштування моделі** | `Stable` | max tokens, temperature, top_p, власний системний префікс, автозаголовки за мовами, інтенсивність мислення |
| **Власний фон** | `Stable` | Завантажте зображення з контролем непрозорості / розмиття |
| **Персони** | `Stable` | Пресети системних промптів, перемикаються для кожної сесії |
| **Теми** | `Stable` | Світла / Темна / Синя / Скло / Ретро |
| **15 мов інтерфейсу** | `Beta` | Англійська, китайська (简/繁/文言), японська, іспанська, французька, німецька, португальська, російська, українська, арабська (RTL), хінді, корейська |
| **Автооновлення** | `Beta` | NSIS-інсталятор перевіряє при запуску; портативна теж (ручна установка) |
| **Відстеження використання** | `Beta` | Журнал кожного виклику API з токенами, вартістю, затримкою, відсотком попадання в кеш |

### Приватність

> **Усі дані залишаються локальними.** AetherAI нічого не збирає і нічого про вас не завантажує. Ваші API-ключі, розмови та персони зберігаються в локальній базі SQLite. Єдині вихідні мережеві запити йдуть до налаштованих вами LLM-провайдерів.

---

## Структура проєкту

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

## Технологічний стек

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

## Подяки

AetherAI стоїть на плечах цих проєктів — їхні ідеї сформували архітектуру та UX:

### Агентські фреймворки

| Проєкт | Натхнення |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Модель дозволів агента, повзунок інтенсивності мислення, візуалізація викликів інструментів, делегування підагентам, гачки |
| [OpenClaw](https://github.com/openclaw/openclaw) | Згортання контексту, виявлення циклів викликів інструментів, архітектура потоку подій |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Бюджет ітерацій, структурована довгострокова пам'ять, автономні навички |
| [OpenAI Codex](https://github.com/openai/codex) | Пісочниця, стиснення контексту, відновлення викликів інструментів |
| [DS4](https://github.com/antirez/ds4) | Ієрархічна декомпозиція завдань |

### UI та UX

| Проєкт | Натхнення |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Методологія копіюйте-вставте компонентів на основі cn() / cva |
| [Magic UI](https://github.com/magicuidesign/magicui) | Патерни анімації (shimmer, blur-fade) |

### Інфраструктура

| Проєкт | Натхнення |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Нормалізація провайдерів для різних форматів |
| [MCP](https://modelcontextprotocol.io) | Специфікація, якою розмовляє агент AetherAI |
| [cc-switch](https://github.com/farion1231/cc-switch) | Макет дашборду статистики використання |
| [new-api](https://github.com/QuantumNous/new-api) | Relay-перетворення reasoning-effort, відстеження використання/вартості |
| [Continue](https://github.com/continuedev/continue) | Конфіг як єдине джерело істини, абстракція провайдерів |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Багатоходове виконання агента, виконання інструментів у пісочниці |
| [Aider](https://github.com/Aider-AI/aider) | Цикл інструментів LLM-асистента кодування, інтеграція git |
| [Cline](https://github.com/cline/cline) | IDE-вбудований агент, інтеграція MCP, UX дозволів |

---

## Участь

Усі внески вітаються! Чи то виправлення помилок, запит нової функції, покращення перекладу або оновлення документації — відкрийте issue або надішліть PR.

1. Форкніть репозиторій
2. Створіть гілку для нової функції (`git checkout -b feat/my-feature`)
3. Зафіксуйте зміни (`git commit -am 'Add feature'`)
4. Відправте в гілку (`git push origin feat/my-feature`)
5. Відкрийте Pull Request

Див. [CONTRIBUTING.md](./CONTRIBUTING.md) для детальних рекомендацій.

---

## Ліцензія

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
