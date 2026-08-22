<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="Aether" />

# Aether

### Локально в первую очередь · Мультимодельный · Встроенный агент

Общайтесь с любой моделью, запускайте безопасного кодирующего агента и сравнивайте модели бок о бок — на рабочем столе или в терминале.

**Electron + Node.js · React + TypeScript · MCP · Agent · Skills**

[![GitHub downloads](https://img.shields.io/github/downloads/TQSY114514/Aether/total?style=flat-square&label=downloads)](https://github.com/TQSY114514/Aether/releases) [![npm downloads](https://img.shields.io/npm/dm/aetherai?style=flat-square&label=npm%20downloads)](https://www.npmjs.com/package/aetherai)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download)


[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>Переводы могут отставать от английской / упрощённой китайской версий.</sup>

</div>

---

> **Статус: Beta.** Aether — сольный/хобби-проект. Он работает, но возможны шероховатости. Отчёты об ошибках приветствуются — см. [CONTRIBUTING.md](./CONTRIBUTING.md) и [SECURITY.md](./SECURITY.md).

> [!CAUTION]
> **Предупреждение Windows SmartScreen — это норма.** Aether создаётся студентом-разработчиком без коммерческого сертификата подписи кода, поэтому Windows 11 / Defender при первом запуске может показать «Windows защитил ваш компьютер».
> **Приложение безопасно и открыто — просмотрите код, затем нажмите «Подробнее → Выполнить в любом случае».**
> Если антивирус поместил его в карантин, добавьте папку приложения в исключения антивируса (подробнее см. [Загрузка](#загрузка)). Никакие данные не покидают ваш компьютер, кроме как к настроенным вами LLM-провайдерам.

**Платформа: только Windows.** Официальные сборки, тестирование и поддержка нацелены на Windows. macOS / Linux могут собираться из исходников, но официально не поддерживаются; подпись кода не планируется — ожидайте предупреждение SmartScreen «неизвестный издатель» при первом запуске (см. [Загрузка](#загрузка)).

**Одно приложение для каждой модели.** OpenAI / Claude / DeepSeek / локальные модели / любая OpenAI-совместимая конечная точка — общайтесь, запускайте кодирующего агента и сравнивайте модели друг с другом на мультимодельной арене с голосованием ELO.

**Локальные данные — заложено в дизайне.** Ключи API и разговоры хранятся в локальной базе SQLite и никогда не покидают ваш компьютер — кроме тех провайдеров, которых вы настроили.

**Безопасно по умолчанию.** Встроенный агент работает в песочнице рабочей области с лестницей разрешений: доступ к файлам и командам подтверждается до его выполнения, а каждый вызов инструмента проверяем.

---

## Два продукта, один репозиторий

Aether распространяется в виде двух независимых артефактов с общим агентским рантаймом:

- **Aether Desktop** — GUI на Electron + React. Скачайте из [GitHub Releases](#загрузка--десктоп). Работает сразу после установки.
- **Aether CLI / TUI / SDK** — headless-агент, терминальный интерфейс на Ink v5 и SDK без Electron. Установите через `npm install -g aetherai` ([установка →](#загрузка--cli--tui--sdk)). Бинарник CLI — `aether`.

> **Aether начинался как десктопное приложение.** CLI и TUI были добавлены позже и всё ещё догоняют. Если вам нужен просто рабочий AI-рабочее место, начните с **Aether Desktop**. Слой CLI/TUI/SDK экспериментальный: API и поведение могут меняться, а некоторые функции могут быть неполными или ненадёжными.

Оба используют общий `agentCore`, 42 инструмента, память SQLite, мультимодельную маршрутизацию, MCP-серверы и одно хранилище сессий. Чат, начатый в GUI, можно продолжить в TUI командой `aether tui --session <id>` — и наоборот.

---

## Чем Aether отличается

Aether объединяет в одно локальное десктопное приложение несколько возможностей, которые обычно разбросаны по разным инструментам:

| Возможность | Описание | Зрелость |
|---|---|:---:|
| **Мультипровайдерный чат** | Переключайтесь между OpenAI, Claude, DeepSeek и любой OpenAI-совместимой конечной точкой прямо в ходе разговора. | `Stable` |
| **Цикл инструментов агента** | 42 встроенных инструмента с циклом Plan-Act-Observe, песочницей и лестницей разрешений. | `Beta` |
| **Мультимодельная арена** | Отправьте один запрос нескольким моделям, голосуйте за лучший ответ, отслеживайте рейтинги ELO. | `Beta` |
| **Навыки и расширяемость** | Подключаемые файлы `SKILL.md`, серверы MCP, система из 10 хуков. | `Experimental` |
| **Структурированная память** | Агент вспоминает предпочтения и прошлые решения между сессиями. | `Beta` |
| **Иерархическое планирование** | Сложные запросы автоматически разбиваются на параллельные подзадачи. | `Experimental` |
| **Сжатие контекста** | Длинные разговоры автоматически резюмируются без потери пар «вызов инструмента — результат». | `Beta` |
| **Конфиденциальность по умолчанию** | Разговоры, ключи и персоны — в локальной SQLite. Ничего не покидает ваш компьютер. | `Stable` |
| **15 языков интерфейса** | Включая классический китайский (классический китайский) и арабский RTL. | `Beta` |
| **Терминальный TUI** | Интерактивный терминал на Ink v5: поток сессий, карточки инструментов, просмотр/откат diff, клавиатурный шлюз разрешений, дерево сессий `/fork`, `/memory`, steering-ввод во время выполнения. | `Experimental` |
| **Headless CLI · RPC · SDK** | CLI в четырёх режимах (разовый / NDJSON / JSONL RPC / конвейер), SDK без Electron (`aetherai/sdk`), машиночитаемый JSONL-протокол. | `Experimental` |
| **Лицензия MIT** | Полностью открытый исходный код. | `Stable` |

---

## Загрузка

> Выберите **одно**. Оба продукта используют один агентский рантайм и одно хранилище сессий.
> - **Просто нужен десктопный чат?** → [Aether Desktop](#загрузка--десктоп)
> - **Нужен терминальный агент / CI / SDK?** → [Aether CLI](#загрузка--cli--tui--sdk)

### Загрузка — Десктоп

**Windows — готовый установщик (рекомендуется большинству пользователей)**

Скачайте последний [Релиз](https://github.com/TQSY114514/Aether/releases):

| Сборка | Описание |
|---|---|
| **`aetherai-setup-x.y.z.exe`** | Установщик NSIS. Для текущего пользователя (без прав администратора), автоматические обновления в приложении. **Рекомендуется.** |
| **`aetherai-x.y.z.exe`** | Портативный одиночный exe. Без установки и автообновления; просто запустите. |

> Установщик показывает предупреждение SmartScreen «неизвестный издатель» при первом запуске — это ожидаемо для неподписанного сольного приложения. Все данные остаются локальными.
>
> ⚠️ Некоторые антивирусы могут помещать в карантин распакованный `electron.exe` при упаковке, так как приложение не подписано. Если установщик удалён вашим антивирусом, добавьте исключение или используйте портативную сборку.

### Загрузка — CLI / TUI / SDK

**`aetherai`** — это npm-пакет. Он объединяет headless CLI, интерактивный TUI на Ink v5 и SDK без Electron в одном бинарнике.

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

`aether` и `aetherai` указывают на один и тот же пакет. Закрепите версию командой `npm install -g aetherai@0.7.1`, чтобы она совпадала с десктоп-релизом.

> **Общие данные с GUI** — оба продукта используют одну и ту же базу данных SQLite (`%APPDATA%/aetherai/aetherai.db`). Сессию, начатую в десктоп-приложении, можно продолжить в TUI — и наоборот.

### Запуск из исходников (разработчики / продвинутые пользователи)

Если вы предпочитаете запуск из исходников или хотите изменить код, используйте `start.bat` (требуется [Node.js 22+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

Пошаговая инструкция — в разделе [Быстрый старт](#-quick-start).

> **Два продукта или одно дерево исходников** — оба продукта живут в одном репозитории. `app/electron/` — общий агентский рантайм, `app/src/` — рендерер десктопа, `app/cli.js` + `app/tui/` — точки входа CLI/TUI. Релизы помечаются git-тегами (`v*`), и из одного тега вы получаете и десктоп-установщик, и публикацию в npm.

---

## Быстрый старт

**Требования:** Node.js 22+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

Либо запустите `start.bat` в корне репозитория на Windows.

### Попробуйте терминал (окно Electron не требуется)

```bash
cd app && npm install
node cli.js tui              # интерактивный терминальный интерфейс (Node ≥ 22; лучше всего в Windows Terminal)
node cli.js "привет"         # разовый prompt
echo "подведи итог" | node cli.js  # stdin из конвейера как prompt
node cli.js --mode json "x"  # поток событий NDJSON (скрипты/CI)
node cli.js tui --smoke      # headless-смоук-тест конечного автомата
```

### Настройка провайдера

1. После запуска нажмите **Models** на боковой панели.
2. Добавьте провайдера (название / API URL / API Key).
3. Нажмите **Fetch models**, чтобы загрузить список доступных моделей.
4. Вернитесь в чат и начинайте общение.

### Включение режима Ask

1. Откройте **Settings - Agent & Safety**.
2. Установите режим разрешений агента **Ask**.
3. Убедитесь, что корневая папка рабочей области — та, с которой агент должен читать/писать.
4. Держите **Yolo** отключённым, если не хотите неограниченного доступа.

### Первая задача агента

1. Откройте новый чат.
2. Спросите: `List the files in this project and summarize what the app does.`
3. Проверяйте каждый предлагаемый вызов инструмента. Одобряйте безопасные чтения; отклоняйте всё неожиданное.
4. Смотрите живой ход рассуждений и итоговый ответ.

---

## Возможности

**Метки статусов:** `Stable` = готово к ежедневному использованию, `Beta` = можно использовать, но есть известные шероховатости, `Experimental` = новое/продвинутое поведение может меняться, `Planned` = пункт задокументированной дорожной карты.

### Чат

| Функция | Статус | Описание |
|---|:---:|---|
| **Мультипровайдерность** | `Stable` | Единый слой адаптеров; добавление провайдера = один файл. Поддерживает OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Параллельный стриминг** | `Stable` | Один чат стримит, пока вы продолжаете общаться в другом. |
| **Слайдер усилия мышления** | `Beta` | Настоящие параметры: OpenAI o-series / gpt-5 / Claude через ретранслятор. Эффективно только на рассуждающих моделях (reasoning). |
| **Вложения** | `Beta` | Текстовые файлы как контекст; изображения для мультимодальности (нужна модель с поддержкой изображений, vision). |
| **Сворачивание длинной вставки** | `Stable` | Сотни строк автоматически сворачиваются в раскрываемый фрагмент (в стиле ChatGPT). |
| **Редактирование сообщений** | `Stable` | Перезапись + регенерация с любого места. |
| **Поиск по сообщениям** | `Stable` | С подсветкой по всем сообщениям. |
| **Сводки в боковой панели** | `Beta` | Тематические фразы, сгенерированные моделью, а не скопированный текст. |

### Агент (Function Calling)

- `Beta` **42 встроенных инструмента** — работа с файлами (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), интернет (`web_search`, `web_fetch`), оболочка (`run_command`), git и GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), интеллект кода (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), метаданные агента (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — с циклом Plan-Act-Observe, живым ходом рассуждений + чек-листом задач, детекцией зацикливания, тайм-аутами для каждого инструмента, настраиваемым бюджетом итераций (по умолчанию 25 раундов) и сжатием контекста.
- `Experimental` **Иерархическое планирование** — автоматически строит разбиение задач для сложных запросов.
- `Experimental` **Делегирование подагентам** — независимые подзадачи выполняются параллельно через `delegate_task`.
- `Stable` **Режимы разрешений** — лестница по возрастанию риска:

| Режим | Описание | Песочница |
|---|---|:---:|
| **Off** | Обычный чат, без инструментов | N/A |
| **Plan** | Только чтение (исследование без изменений) | - |
| **Ask** | Подтверждение каждого рискованного действия (рекомендуется) | - |
| **Auto** | Выполнять всё без подтверждений | Да |
| **Yolo** | Полные права, без песочницы | Нет |

- `Stable` **Песочница рабочей области** — `write_file`/`edit_file` отклоняются за пределами настроенной корневой папки; `run_command` блокирует деструктивные паттерны. Настраивается в Settings - Agent & Safety.
- `Beta` **Сжатие контекста** — автоматически резюмирует более старую историю (пары «вызов инструмента — результат» сохраняются полностью; идентификаторы переносятся дословно).
- `Beta` **Восстановление вызовов инструментов** — автоматически чинит некорректный JSON, отсутствующие аргументы, ключи без кавычек и обрезанные вызовы.

### Память и обучение

- `Beta` **Автоматическая долговременная память** — релевантные воспоминания внедряются перед каждым ходом; ключевые факты извлекаются и сохраняются автоматически. Включается/отключается в Settings - Agent.
- `Experimental` **Изучение привычек** — обнаруживает повторяющиеся предпочтения (например, «всегда использовать Claude») и предлагает автоматически применяемые навыки.
- `Beta` **Журнал аудита** — трассировка выполнения агента по каждому ходу для отладки.

### Арена

- `Beta` **Мультимодельная арена** — один запрос, несколько моделей отвечают **одновременно**; голосуйте за лучший ответ, и **таблица лидеров ELO** обновляется автоматически. Модели оцениваются **по намерению** (код / математика / перевод / резюме / общие). *Ни одно другое локальное десктопное чат-приложение не поставляет встроенную мультимодельную арену с ELO.*

### Навыки и расширяемость

| Компонент | Формат | Статус | Подробности |
|---|---|:---:|---|
| **Навыки** | `SKILL.md` | `Experimental` | Поместите в `<workspace>/.claude/skills/`; в комплекте `release-checklist` и `git-commit` |
| **Слэш-команды** | `CMD.md` | `Stable` | 6 встроенных: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Хуки** | Script | `Experimental` | 10 точек жизненного цикла: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Внешние серверы MCP автоматически объединяются со встроенными инструментами |

### Настройка

| Параметр | Статус | Описание |
|---|:---:|---|
| **Расширенные настройки модели** | `Stable` | Max tokens, temperature, top_p, свой системный префикс, авто-заголовки по языкам, усилия мышления |
| **Пользовательский фон** | `Stable` | Загрузка изображения с контролем прозрачности / размытия |
| **Персоны** | `Stable` | Пресеты системного промпта, переключаются для каждой сессии |
| **Темы** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 языков интерфейса** | `Beta` | Английский, китайский (Упрощённый / Традиционный / Классический), японский, испанский, французский, немецкий, португальский, русский, украинский, арабский (RTL), хинди, корейский |
| **Автообновление** | `Beta` | Установщик NSIS проверяет при запуске; портативная версия тоже (ручная установка) |
| **Учёт использования** | `Beta` | Лог каждого вызова API: токены, стоимость, задержка, доля попаданий в кэш |

### Конфиденциальность

> **Все данные остаются локальными.** Aether ничего о вас не собирает и ничего не загружает. Ваши ключи API, разговоры и персоны хранятся в локальной базе SQLite. Единственные исходящие сетевые запросы — к провайдерам LLM, которых вы настроили.

---

## Терминальный TUI, RPC и SDK

Помимо десктопного приложения и обычного CLI, Aether поставляет интерактивный терминальный интерфейс, машиночитаемый режим JSONL RPC и SDK без Electron. Все три используют то же ядро агента, память, персон, MCP-инструменты и правила разрешений, что и десктоп.

### Быстрый старт — двойная форма

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

Дополнительные headless-флаги: `--persona <id>` (внедрение persona + памяти), `--memory-trace` (отчёт о количестве внедрённых записей памяти), `--skills` (JSON предложений навыков), `--setup-term` (запись профиля Windows Terminal), `--stdin` (явный ввод из конвейера).

### TUI (`aether tui`)

Интерактивный терминальный агент (Ink v5; Node ≥ 22; лучше всего работает в Windows Terminal):

- **Сессии**:поточный рендеринг сообщений, дерево сессий `/fork` (`session.parent_session_id`), `/sessions`, переключение истории через `/use <id>`
- **Инструменты и разрешения**:карточки вызовов инструментов (цвет статуса / время / сводка), просмотр diff (`Alt+v` развернуть, `Enter` принять / `r` откатить — восстановление снимка до записи, работает и не в git-каталогах), клавиатурный шлюз разрешений (`y` разрешить один раз / `a` разрешать всегда / `n` отказать, либо `←→` для выбора), автоматический пропуск инструментов только на чтение
- **Режимы утверждения**:`Shift+Tab` циклирует `manual → auto-edits → plan` (plan = планирование только на чтение; после завершения три варианта определяют, как реализовать)
- **Режимы**:`Alt+m` переключает ask/plan/auto; `/persona <id>` переключает персону (внедрение persona + префикс памяти)
- **Горячие клавиши лидера**:`Ctrl+X`, затем `m` — выбор модели / `n` — новая сессия / `l` — список сессий / `g` — таймлайн / `r` — откат к чекпоинту / `q` — выход
- **Палитра команд**:`Ctrl+P` или `x` (New chat / Model / Timeline / Export JSONL / Help / Quit)
- **Переназначение клавиш**:`~/.config/aether/keybindings.json` (например, `{ "char:?": null }` отключает клавишу помощи `?`)
- **Хранение ключей API**:`/apikey <provider> <key>` сохраняет в `auth.json` (ключи, зашифрованные safeStorage в десктопной версии, не могут быть расшифрованы в headless; используйте эту команду или переменную окружения `AETHER_API_KEY`)
- **Замкнутый цикл памяти и навыков**:`/memory <ключевое слово>` поиск, `--memory-trace` — количество внедрённых записей, `/skills` + `/skill accept|dismiss <key>` (habitLearner → предложения навыков)
- **steering**:во время работы `Ctrl+C` прерывает → ввод следующей команды → внедрение в текущий цикл (в очереди отображается `steer:n`); во время работы `Tab` ставит следующую команду в очередь
- **Горячие клавиши**:двойное нажатие `Esc` — выход (или `/quit`), `Esc` — очистка ввода (черновик в историю), `?` — экран помощи, `PgUp/PgDn`/колесо мыши — прокрутка, в статус-баре в реальном времени `approval/mode/model/tok/ctx`; полный список клавиш — в [docs/tui-keys.md](./docs/tui-keys.md)

### RPC (`aether --mode rpc`)

Машиночитаемый JSONL-протокол через stdin/stdout: на вход кадры `request`, на выход кадры `event`/`result`/`error` — по одному JSON-объекту в строке, без человекочитаемого текста. Методы: `run` (стримит события `text`/`tool`/`plan`/`status`), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. Справочник кадров: [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

Агрегация ядра агента без Electron для внешних Node-проектов: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, кадры `rpc`, `sessionContext` (внедрение persona + памяти). Включены объявления типов (`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Нативная интеграция с Windows

| Возможность | Описание |
|---|---|
| **Меню в трее** | Показать/скрыть окно, новая сессия, **новая задача** (открывает TaskPanel напрямую); клик по значку в трее переключает видимость. |
| **Глобальные горячие клавиши** | `Ctrl+Alt+A` вызывает главное окно (создаёт, если не запущено); результат регистрации записывается в журнал запуска. |
| **Протокол `aetherai://`** | `aetherai://new` / `chat` — новая сессия; `aetherai://tui` — запуск в терминальном виде; `aetherai://open/?path=<кодированный путь>` — задать папку рабочим пространством и создать сессию (цепочка «Открыть с помощью Aether» в контекстном меню). |
| **Регистрация в контекстном меню** | `app/resources/register-protocol.reg` (замените `<AETHER_EXE>` и импортируйте от администратора): `.cs/.js/.ts/.tsx/.md/.json` + папки → пункт «Открыть с помощью Aether» в контекстном меню. |
| **Настройка терминала** | `app/resources/term/aether.ps1` (алиас + запуск `aether tui`); `node app/cli.js --setup-term` записывает профиль Windows Terminal (тёмная/светлая схемы). |
| **Укрепление песочницы** | Защита Windows-путей: длинные пути `\\?\`, UNC `\\server\share`, выход через точки повторной обработки / junction, опасные расширения `.lnk/.scr/.msi` и т.д. |

---

## Структура проекта

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

## Технологический стек

| Слой | Технология |
|---|---|
| Десктоп | Electron 43 |
| Фронтенд | React 18.3 + TypeScript 5.8 |
| Состояние | Zustand 4.5 |
| Сборка | Vite 8 + electron-builder |
| База данных | better-sqlite3 (нативный SQLite, режим WAL) |
| LLM | OpenAI-совместимый + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Пользовательский stdio JSON-RPC 2.0 клиент |
| TUI | Ink 5 + React 18 (createElement, без JSX) |
| CLI/SDK | Node.js headless CLI (4 режима) + SDK без Electron |

---

## Благодарности

Aether стоит на плечах этих проектов — их идеи сформировали архитектуру и UX:

### Агентные фреймворки

| Проект | Что вдохновило |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | Сжатие контекста, детекция зацикливания вызовов инструментов, архитектура событийного потока |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Бюджет итераций, структурированная долговременная память, автономные навыки, cron-планировщик, поиск по памяти FTS5 |
| [Evolver](https://github.com/EvoMap/evolver) | Движок самоэволюции, GEP (Genome Evolution Protocol) |
| [Aider](https://github.com/Aider-AI/aider) | Цикл инструментов LLM-ассистента по коду, интеграция с git |
| [Cline](https://github.com/cline/cline) | Агент, встроенный в IDE, интеграция MCP, UX разрешений |
| [OpenCode](https://github.com/sst/opencode) | TUI-UX клавиатуры/темы/разрешений, слой кэш-политики промптов |
| [OpenAI Codex](https://github.com/openai/codex) | Изоляция дерева процессов в песочнице, UX индикатора времени и статуса |

### UI и UX

| Проект | Что вдохновило |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Методология компонентов копипастом cn() |
| [Magic UI](https://github.com/magicuidesign/magicui) | Паттерны анимаций (shimmer, blur-fade) |
| [cc-switch](https://github.com/farion1231/cc-switch) | Макет панели статистики использования |

### Инфраструктура

| Проект | Что вдохновило |
|---|---|
| [MCP](https://modelcontextprotocol.io) | Спецификация, на которой говорит агент Aether |
| [new-api](https://github.com/QuantumNous/new-api) | Формы параметра reasoning-effort (логика преобразования relay) |

---

## Участие в разработке

Любой вклад приветствуется! Исправление ошибки, запрос функции, улучшение перевода или обновление документации — пожалуйста, откройте issue или отправьте PR.

1. Форкните репозиторий
2. Создайте ветку функции (`git checkout -b feat/my-feature`)
3. Закоммитьте изменения (`git commit -am 'Add feature'`)
4. Запушьте в ветку (`git push origin feat/my-feature`)
5. Откройте Pull Request

Подробные правила — в [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Лицензия

[MIT](./LICENSE) © 2025 Aether

---

<div align="center">

Сделано с ❤️ на Electron + Node.js + React + TypeScript

[⬆ Наверх](#aether)

</div>
