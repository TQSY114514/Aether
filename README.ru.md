<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Локальный, мульти-модельный настольный ИИ-воркбенч

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#участие)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#загрузка) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#быстрый-старт) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#технологический-стек) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#настройка) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#навыки--расширяемость)

`Beta` · `Личный / хобби-проект` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Статус: Beta.** AetherAI — личный/хобби-проект. Он работает, но возможны
> шероховатости. О багах сообщайте — см. [CONTRIBUTING.md](./CONTRIBUTING.md) и
> [SECURITY.md](./SECURITY.md).

Объединяет несколько LLM-провайдеров — OpenAI / Claude / DeepSeek / локальные модели / любую OpenAI-совместимую конечную точку — в одном настольном приложении. Агент, читающий и записывающий файлы и выполняющий команды, рабочая песочница, мульти-модельная арена с голосованием ELO, навыки и 15 языков интерфейса. Всё хранится локально: API-ключи и переписки никогда не покидают ваш компьютер, за исключением обращений к настроенным вами провайдерам.

---

## Что отличает AetherAI

AetherAI объединяет несколько возможностей, которые обычно разбросаны по разным инструментам, в одном локальном настольном приложении:

| Возможность | Описание | Зрелость |
|---|---|:---:|
| **Мульти-провайдер чат** | Переключайтесь между OpenAI, Claude, DeepSeek и любой OpenAI-совместимой конечной точкой прямо во время разговора. | `Stable` |
| **Цикл инструментов агента** | 16 встроенных инструментов с циклом «План-Действие-Наблюдение», песочница, лестница разрешений. | `Beta` |
| **Мульти-модельная арена** | Отправьте один промпт нескольким моделям, проголосуйте за лучшую, отслеживайте ELO-рейтинг. | `Beta` |
| **Навыки и расширяемость** | Drop-in `SKILL.md` файлы, MCP-серверы, 10-точечная система хуков. | `Experimental` |
| **Структурированная память** | Агент вспоминает предпочтения и прошлые решения между сессиями. | `Beta` |
| **Иерархическое планирование** | Сложные запросы автоматически разбиваются на параллельные подзадачи. | `Experimental` |
| **Сжатие контекста** | Длинные разговоры автоматически суммируются без потери пар вызовов инструментов. | `Beta` |
| **Локальная конфиденциальность** | Переписки, ключи, персоны в локальной SQLite. Ничего не покидает ваш компьютер. | `Stable` |
| **15 языков интерфейса** | Включая классический китайский (文言) и арабский с RTL. | `Beta` |
| **Лицензия MIT** | Полностью открытый исходный код. | `Stable` |

---

## Загрузка

### Windows — готовый установщик (рекомендуется для большинства пользователей)

Скачайте последний [Release](https://github.com/TQSY114514/AetherAI/releases):

| Сборка | Описание |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS-установщик. Для пользователя (без admin), автообновление внутри приложения. **Рекомендуется.** |
| **`AetherAI-x.y.z.exe`** | Портативный single-exe. Без установки, без автообновления; просто запустите. |

> Установщик показывает предупреждение SmartScreen «неизвестный издатель» при первом запуске — это ожидаемо для неподписанного одиночного приложения. Все данные остаются локальными.
>
> ⚠️ Некоторые антивирусы могут помещать в карантин распакованный `electron.exe` во время упаковки, поскольку приложение не подписано. Если установщик удалён вашим AV, добавьте исключение или используйте портативную сборку.

### Запуск из исходников (разработчики / продвинутые пользователи)

Если вы предпочитаете запускать из исходников или хотите изменять код, используйте `start.bat` (требуется [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/AetherAI.git
cd AetherAI
start.bat        # Windows: устанавливает зависимости, собирает фронтенд, запускает Electron
```

См. [Быстрый старт](#быстрый-старт) для ручного пошагового руководства.

> **exe против start.bat** — оба поддерживаются и служат разной аудитории:
> - **Установщик exe** — для конечных пользователей: двойной клик для установки, пункт в меню «Пуск», автообновление в приложении, Node.js не требуется.
> - **start.bat** — для разработчиков / тinkerers: прозрачный пайплайн `npm install` → `vite build` → `electron .`, edit-and-run, требует Node.js.

---

## Быстрый старт

**Предварительные требования:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # разработка (горячая перезагрузка)
npm run build    # продакшен-фронтенд
npm start        # запуск Electron
```

Или запустите `start.bat` в корне репозитория на Windows.

### Настройка провайдера

1. После запуска нажмите **Models** в боковой панели.
2. Добавьте провайдера (имя / API URL / API Key).
3. Нажмите **Fetch models**, чтобы получить список доступных моделей.
4. Вернитесь к чату и начните общение.

### Включите режим Ask

1. Откройте **Settings - Agent & Safety**.
2. Установите режим разрешений агента на **Ask**.
3. Убедитесь, что корень рабочей папки — это папка, в которой агент должен читать/записывать.
4. Держите **Yolo** выключенным, если вам не нужен неограниченный доступ.

### Запустите первую задачу агента

1. Откройте новый чат.
2. Спросите: `List the files in this project and summarize what the app does.`
3. Проверяйте каждый предложенный вызов инструмента. Одобряйте безопасные чтения; отклоняйте всё неожиданное.
4. Проверьте живую трассировку рассуждений и финальный ответ.

---

## Возможности

**Метки статуса:** `Stable` = готово для ежедневного использования, `Beta` = usable с известными шероховатостями, `Experimental` = новое/продвинутое поведение может измениться, `Planned` = задокументированный пункт дорожной карты.

### Чат

| Возможность | Статус | Описание |
|---|:---:|---|
| **Мульти-провайдер** | `Stable` | Единый слой адаптеров; добавление провайдера = один файл. Охватывает OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Параллельный стриминг** | `Stable` | Один чат стримит, пока вы продолжаете общаться в другом. |
| **Ползунок усилия размышления** | `Beta` | Реальные параметры: OpenAI o-series / gpt-5 / Claude через релей. Эффективно только на reasoning-моделях. |
| **Вложения** | `Beta` | Текстовые файлы как контекст; изображения для мультимодальности (нужна vision-модель). |
| **Свёртка длинных вставок** | `Stable` | Сотни строк автоматически сворачиваются в раскрываемый фрагмент (в стиле ChatGPT). |
| **Редактирование сообщений** | `Stable` | Перезапись + регенерация из любой точки. |
| **Поиск по сообщениям** | `Stable` | С подсветкой по всем сообщениям. |
| **Сводки в боковой панели** | `Beta` | Тематические фразы, сгенерированные моделью, а не скопированный текст. |

### Агент (вызов функций)

- `Beta` **16 встроенных инструментов** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) с циклом «План-Действие-Наблюдение», живой трассировкой рассуждений + чек-листом задач, обнаружением зацикливания, таймаутами на каждый инструмент, настраиваемым бюджетом итераций (по умолчанию 25 раундов) и сжатием контекста.
- `Experimental` **Иерархическое планирование** — авто-генерация разбивки задач для сложных запросов (вдохновлено DS4).
- `Experimental` **Делегирование суб-агенту** — независимые подзадачи выполняются параллельно через `delegate_task`.
- `Stable` **Режимы разрешений** — лестница с возрастающим риском:

| Режим | Описание | Песочница |
|---|---|:---:|
| **Off** | Обычный чат, без инструментов | N/A |
| **Plan** | Инструменты только для чтения (исследование без изменений) | - |
| **Ask** | Подтверждать каждое рискованное действие (рекомендуется) | - |
| **Auto** | Выполнять всё без подтверждений | Да |
| **Yolo** | Полные разрешения, без песочницы | Нет |

- `Stable` **Песочница рабочего пространства** — `write_file`/`edit_file` отклоняются вне настроенного корня рабочего пространства; `run_command` блокирует деструктивные паттерны. Настраивается в Settings - Agent & Safety.
- `Beta` **Сжатие контекста** — автоматически суммирует старую историю (пары вызов-инструмент/результат сохраняются нетронутыми; идентификаторы сохраняются дословно).
- `Beta` **Ремонт вызовов инструментов** — автоматически исправляет некорректный JSON, отсутствующие аргументы, незакавыченные ключи и усечённые вызовы.

### Память и обучение

- `Beta` **Автоматическая долгосрочная память** — релевантные воспоминания внедряются перед каждым ходом; ключевые факты извлекаются и сохраняются автоматически. Включается в Settings - Agent.
- `Experimental` **Обучатель привычек** — обнаруживает повторяющиеся предпочтения (например, «всегда использовать Claude») и предлагает авто-применяемые навыки.
- `Beta` **Журнал аудита** — трассировка выполнения агента по ходам для отладки.

### Арена

- `Beta` **Мульти-модельная арена** — один промпт, несколько моделей отвечают **одновременно**; голосуйте за лучшую, и **ELO-таблица лидеров** обновляется автоматически. Модели оцениваются **по намерению** (кодинг / математика / перевод / сводка / общее). *Ни одно другое локальное настольное чат-приложение не поставляется со встроенной мульти-модельной ареной с ELO.*

### Навыки и расширяемость

| Компонент | Формат | Статус | Подробности |
|---|---|:---:|---|
| **Навыки** | `SKILL.md` | `Experimental` | Перенесите в `<workspace>/.claude/skills/`; поставляется с `release-checklist` и `git-commit` |
| **Slash-команды** | `CMD.md` | `Stable` | 6 встроенных: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Хуки** | Скрипт | `Experimental` | 10 точек жизненного цикла: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Внешние MCP-серверы автоматически объединяются со встроенными инструментами |

### Настройка

| Параметр | Статус | Описание |
|---|:---:|---|
| **Расширенные настройки модели** | `Stable` | Max tokens, temperature, top_p, пользовательский системный префикс, автозаголовки по языкам, усилие размышления |
| **Своё фоновое изображение** | `Stable` | Загрузите изображение с управлением прозрачностью / размытием |
| **Персоны** | `Stable` | Пресеты системных промптов, переключаемые для каждой сессии |
| **Темы** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 языков интерфейса** | `Beta` | Английский, китайский (简/繁/文言), японский, испанский, французский, немецкий, португальский, русский, украинский, арабский (RTL), хинди, корейский |
| **Автообновление** | `Beta` | NSIS-установщик проверяет при запуске; портативная версия тоже (ручная установка) |
| **Отслеживание использования** | `Beta` | Журнал каждого вызова API с токенами, стоимостью, задержкой, процентом попаданий в кэш |

### Конфиденциальность

> **Все данные остаются локальными.** AetherAI ничего не собирает и не загружает о вас. Ваши API-ключи, переписки и персоны хранятся в локальной базе SQLite. Единственные исходящие сетевые запросы идут к LLM-провайдерам, которых вы настроили.

---

## Структура проекта

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

## Технологический стек

| Слой | Технология |
|---|---|
| Desktop | Electron 31 |
| Frontend | React 18.3 + TypeScript 5.5 |
| State | Zustand 4.5 |
| Build | Vite 5.4 + electron-builder |
| Database | sql.js (SQLite in-memory, persisted to disk) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |

---

## Благодарности

AetherAI стоит на плечах этих проектов — их идеи сформировали архитектуру и UX:

### Агентские фреймворки

| Проект | Вдохновение |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Модель разрешений агента, ползунок размышления, визуализация вызовов инструментов, делегирование суб-агенту, хуки |
| [OpenClaw](https://github.com/openclaw/openclaw) | Сжатие контекста, обнаружение зацикливания вызовов инструментов, событийно-потоковая архитектура |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Бюджет итераций, структурированная долгосрочная память, автономные навыки |
| [OpenAI Codex](https://github.com/openai/codex) | Песочница, сжатие контекста, ремонт вызовов инструментов |
| [DS4](https://github.com/antirez/ds4) | Иерархическая декомпозиция задач |

### UI и UX

| Проект | Вдохновение |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Методология копируемых компонентов cn() / cva |
| [Magic UI](https://github.com/magicuidesign/magicui) | Паттерны анимации (shimmer, blur-fade) |

### Инфраструктура

| Проект | Вдохновение |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Нормализация мульти-форматных провайдеров |
| [MCP](https://modelcontextprotocol.io) | Спецификация, на которой говорит агент AetherAI |
| [cc-switch](https://github.com/farion1231/cc-switch) | Макет дашборда usage-статистики |
| [new-api](https://github.com/QuantumNous/new-api) | Релей reasoning-effort, отслеживание usage/cost |
| [Continue](https://github.com/continuedev/continue) | Конфиг как источник истины, абстракция провайдеров |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Мульти-ходовое выполнение агента, изолированное выполнение инструментов |
| [Aider](https://github.com/Aider-AI/aider) | Цикл инструментов LLM-кодинг-ассистента, git-интеграция |
| [Cline](https://github.com/cline/cline) | IDE-встроенный агент, MCP-интеграция, UX разрешений |

---

## Участие

Приветствуются любые вклады! Будь то исправление бага, запрос функции, улучшение перевода или обновление документации — пожалуйста, откройте issue или отправьте PR.

1. Форкните репозиторий
2. Создайте ветку функции (`git checkout -b feat/my-feature`)
3. Зафиксируйте изменения (`git commit -am 'Add feature'`)
4. Отправьте в ветку (`git push origin feat/my-feature`)
5. Откройте Pull Request

См. [CONTRIBUTING.md](./CONTRIBUTING.md) для подробных руководств.

---

## Лицензия

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Наверх](#aetherai)

</div>
