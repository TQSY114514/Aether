<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="Aether" />

# Aether

### Local-first · Multi-model · Agent-native

Спілкуйтеся з будь-якою моделлю, запускайте безпечного кодинг-агента та порівнюйте моделі пліч-о-пліч — на робочому столі або в терміналі.

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 43](https://img.shields.io/badge/Electron-43-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>Переклади можуть відставати від англійської / спрощено-китайської версій.</sup>

</div>

---

> **Статус: Beta.** Aether — це сольний/хобі-проєкт. Він працює, але очікуйте шорстких
> країв. Звіти про помилки вітаються — див. [CONTRIBUTING.md](./CONTRIBUTING.md) і
> [SECURITY.md](./SECURITY.md).

**Платформа: лише Windows.** Офіційні збірки, тестування та підтримка орієнтовані на Windows. macOS / Linux можна зібрати з вихідного коду, але вони офіційно не підтримуються, а підписування коду не планується — очікуйте попередження SmartScreen "невідомий видавець" під час першого запуску (див. [Download](#download)).

**Один застосунок для будь-якої моделі.** OpenAI / Claude / DeepSeek / локальні моделі / будь-яка OpenAI-сумісна кінцева точка — спілкуйтеся, запускайте кодинг-агента та порівнюйте моделі віч-на-віч у багатомодельній арені з голосуванням ELO.

**Локальність насамперед за задумом.** API-ключі та розмови зберігаються в локальній базі даних SQLite і ніколи не залишають ваш комп'ютер — крім постачальників, яких ви налаштуєте.

**Безпека за замовчуванням.** Вбудований агент працює в пісочниці робочого простору з драбиною дозволів: доступ до файлів і команд підтверджується до виконання, а кожен виклик інструмента можна аудитувати.

---

## Що робить Aether особливим

Aether поєднує кілька можливостей, які зазвичай розподілені між багатьма інструментами, в один локальний настільний застосунок:

| Можливість | Опис | Зрілість |
|---|---|:---:|
| **Багатопровайдерський чат** | Перемикайтеся між OpenAI, Claude, DeepSeek і будь-якою OpenAI-сумісною кінцевою точкою прямо під час розмови. | `Stable` |
| **Цикл інструментів агента** | 42 вбудовані інструменти з циклом Plan-Act-Observe, пісочницею та драбиною дозволів. | `Beta` |
| **Багатомодельна арена** | Надсилайте один запит кільком моделям, голосуйте за найкращу, відстежуйте рейтинги ELO. | `Beta` |
| **Навички та розширюваність** | Drop-in файли `SKILL.md`, MCP-сервери, система хуків на 10 точок. | `Experimental` |
| **Структурована пам'ять** | Агент згадує вподобання та минулі рішення між сеансами. | `Beta` |
| **Ієрархічне планування** | Складні запити автоматично розкладаються на паралельні підзадачі. | `Experimental` |
| **Ущільнення контексту** | Довгі розмови автоматично підсумовуються без втрати пар викликів інструментів. | `Beta` |
| **Локальна конфіденційність насамперед** | Розмови, ключі, персони в локальному SQLite. Нічого не залишає ваш комп'ютер. | `Stable` |
| **15 мов інтерфейсу** | Включно з класичною китайською (класична китайська) та арабською RTL. | `Beta` |
| **Термінальний TUI** | Інтерактивний термінал на Ink v5: потік сеансів, картки інструментів, перегляд/відкат diff, клавіатурні ворота дозволів, дерево сеансів `/fork`, `/memory`, зворотне впорскування steering під час роботи. | `Beta` |
| **Headless CLI · RPC · SDK** | CLI з чотирма режимами (одноразовий / NDJSON / JSONL RPC / конвеєр), SDK без Electron (`aetherai/sdk`), доступний для машин JSONL-протокол. | `Beta` |
| **Ліцензія MIT** | Повністю відкритий код. | `Stable` |

---

## Завантаження

### Windows — готовий інсталятор (рекомендовано для більшості користувачів)

Завантажте останній [Release](https://github.com/TQSY114514/Aether/releases):

| Збірка | Опис |
|---|---|
| **`aetherai-setup-x.y.z.exe`** | NSIS-інсталятор. Для окремого користувача (без адміністратора), автоматичне оновлення в застосунку. **Рекомендовано.** |
| **`aetherai-x.y.z.exe`** | Портативний один exe. Без встановлення, без автооновлення; просто запустіть. |

> Інсталятор показує попередження SmartScreen "невідомий видавець" під час першого запуску — це очікувано для непідписаного сольного застосунку. Усі дані залишаються локальними.
>
> ⚠️ Деяке антивірусне програмне забезпечення може помістити розпакований `electron.exe` на карантин під час пакування, оскільки застосунок не підписаний. Якщо інсталятор видалено вашим антивірусом, додайте виключення або скористайтеся портативною збіркою.

### Запуск із вихідного коду (розробники / досвідчені користувачі)

Якщо ви віддаєте перевагу запуску з вихідного коду або хочете змінити код, скористайтеся `start.bat` (потрібен [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

Покроковий посібник вручну див. у розділі [Quick Start](#-quick-start).

> **exe проти start.bat** — обидва підтримуються та призначені для різних аудиторій:
> - **Інсталятор exe** — для кінцевих користувачів: подвійний клік для встановлення, запис у меню "Пуск", автоматичне оновлення в застосунку, Node.js не потрібен.
> - **start.bat** — для розробників / експериментаторів: прозорий конвеєр `npm install` → `vite build` → `electron .`, редагуй-і-запускай, потребує Node.js.

---

## Швидкий старт

**Передумови:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

Або запустіть `start.bat` у корені репозиторію на Windows.

### Спробуйте термінал (вікно Electron не потрібне)

```bash
cd app && npm install
node cli.js tui              # інтерактивний термінальний інтерфейс (Node ≥ 22; найкраще у Windows Terminal)
node cli.js "привіт"         # одноразовий prompt
echo "підсумуй це" | node cli.js  # stdin з конвеєра як prompt
node cli.js --mode json "x"  # потік подій NDJSON (скрипти/CI)
node cli.js tui --smoke      # headless-смоук-тест скінченного автомата
```

### Налаштування провайдера

1. Після запуску натисніть **Models** на бічній панелі.
2. Додайте провайдера (назва / URL API / API-ключ).
3. Натисніть **Fetch models**, щоб отримати доступний список моделей.
4. Поверніться до чату та почніть розмову.

### Увімкнення режиму Ask

1. Відкрийте **Settings - Agent & Safety**.
2. Установіть режим дозволів агента на **Ask**.
3. Переконайтеся, що корінь робочого простору — це папка, яку агент має читати/записувати.
4. Тримайте **Yolo** вимкненим, якщо ви не хочете необмеженого доступу.

### Запустіть перше завдання агента

1. Відкрийте новий чат.
2. Запитайте: `List the files in this project and summarize what the app does.`
3. Перегляньте кожен запропонований виклик інструмента. Схвалюйте безпечні читання; відхиляйте все несподіване.
4. Перевірте живий трейс міркувань і фінальну відповідь.

---

## Можливості

**Позначки статусу:** `Stable` = готово для щоденного використання, `Beta` = можна користуватися з відомими шорсткими краями, `Experimental` = нова/розширена поведінка може змінюватися, `Planned` = задокументований пункт дорожньої карти.

### Чат

| Можливість | Статус | Опис |
|---|:---:|---|
| **Багатопровайдерність** | `Stable` | Єдиний шар адаптерів; додавання провайдера = один файл. Охоплює OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Паралельне потокове передавання** | `Stable` | Один чат стрімить, поки ви продовжуєте розмову в іншому. |
| **Повзунок зусиль мислення** | `Beta` | Реальні параметри: OpenAI o-series / gpt-5 / Claude через релей. Діє лише на моделях міркування. |
| **Вкладення** | `Beta` | Текстові файли як контекст; зображення для мультимодальності (потрібна модель зору). |
| **Згортання довгих вставок** | `Stable` | Сотні рядків автоматично згортаються в розгортуваний фрагмент (у стилі ChatGPT). |
| **Редагування повідомлень** | `Stable` | Перезапис + повторна генерація з будь-якої точки. |
| **Пошук повідомлень** | `Stable` | З підсвічуванням по всіх повідомленнях. |
| **Підсумки в бічній панелі** | `Beta` | Згенеровані моделлю тематичні фрази, а не скопійований текст. |

### Агент (Function Calling)

- `Beta` **42 вбудовані інструменти** — операції з файлами (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), веб (`web_search`, `web_fetch`), шелл (`run_command`), git і GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), кодова інтелектуальність (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), мета агента (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — з циклом Plan-Act-Observe, живим трейсом міркувань + чеклистом завдань, виявленням циклів, таймаутами на інструмент, настроюваним бюджетом ітерацій (за замовчуванням 25 раундів) та ущільненням контексту.
- `Experimental` **Ієрархічне планування** — автоматично генерує розбиття завдань для складних запитів (натхненно DS4).
- `Experimental` **Делегування сабагентам** — незалежні підзадачі виконуються паралельно через `delegate_task`.
- `Stable` **Режими дозволів** — драбина за зростанням ризику:

| Режим | Опис | Пісочниця |
|---|---|:---:|
| **Off** | Звичайний чат, без інструментів | Н/Д |
| **Plan** | Тільки для читання (дослідження без змін) | - |
| **Ask** | Підтверджувати кожну ризиковану дію (рекомендовано) | - |
| **Auto** | Виконувати все, без підтверджень | Так |
| **Yolo** | Повні дозволи, без пісочниці | Ні |

- `Stable` **Пісочниця робочого простору** — `write_file`/`edit_file` відхиляються поза налаштованим коренем робочого простору; `run_command` блокує деструктивні патерни. Настроюється в Settings - Agent & Safety.
- `Beta` **Ущільнення контексту** — автоматично підсумовує старішу історію (пари виклик-інструмента/результат зберігаються недоторканими; ідентифікатори зберігаються дослівно).
- `Beta` **Відновлення викликів інструментів** — автоматично виправляє пошкоджений JSON, відсутні аргументи, ключі без лапок та обрізані виклики.

### Пам'ять і навчання

- `Beta` **Автоматична довгострокова пам'ять** — релевантні спогади впроваджуються перед кожним ходом; ключові факти витягуються та зберігаються автоматично. Перемикається в Settings - Agent.
- `Experimental` **Вивчення звичок** — виявляє повторювані вподобання (напр., "завжди використовуй Claude") і пропонує навички для автоматичного застосування.
- `Beta` **Журнал аудиту** — трейс виконання агента за кожним ходом для налагодження.

### Арена

- `Beta` **Багатомодельна арена** — один запит, кілька моделей відповідають **одночасно**; голосуйте за найкращу, і **таблиця лідерів ELO** оновлюється автоматично. Моделі оцінюються **за наміром** (код / математика / переклад / підсумок / загальне). *Жоден інший локальний настільний чат-застосунок не має вбудованої багатомодельної арени з ELO.*

### Навички та розширюваність

| Компонент | Формат | Статус | Деталі |
|---|---|:---:|---|
| **Навички** | `SKILL.md` | `Experimental` | Покладіть у `<workspace>/.claude/skills/`; постачається з `release-checklist` і `git-commit` |
| **Slash-команди** | `CMD.md` | `Stable` | 6 вбудованих: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Хуки** | Script | `Experimental` | 10 точок життєвого циклу: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Зовнішні MCP-сервери автоматично об'єднуються з вбудованими інструментами |

### Налаштування

| Параметр | Статус | Опис |
|---|:---:|---|
| **Розширені налаштування моделі** | `Stable` | Максимальна кількість токенів, temperature, top_p, власний системний префікс, автоматичні заголовки за мовою, зусилля мислення |
| **Власний фон** | `Stable` | Завантаження зображення з контролем непрозорості / розмиття |
| **Персони** | `Stable` | Пресети системних промптів, перемикаються на сеанс |
| **Теми** | `Stable` | Світла / Темна / Синя / Glass / Retro |
| **15 мов інтерфейсу** | `Beta` | Англійська, китайська (Спрощена / Традиційна / Класична), японська, іспанська, французька, німецька, португальська, російська, українська, арабська (RTL), хінді, корейська |
| **Автооновлення** | `Beta` | NSIS-інсталятор перевіряє під час запуску; портативна версія також перевіряє (ручне встановлення) |
| **Відстеження використання** | `Beta` | Журнал кожного API-виклику з токенами, вартістю, затримкою, відсотком влучань у кеш |

### Конфіденційність

> **Усі дані залишаються локальними.** Aether нічого не збирає та нічого про вас не завантажує. Ваші API-ключі, розмови та персони зберігаються в локальній базі даних SQLite. Єдині вихідні мережеві запити йдуть до LLM-провайдерів, яких ви налаштували.

---

## Розширення VS Code і Headless CLI

Окрім настільного застосунку, Aether постачає того самого агента як CLI та розширення редактора:

- **Headless CLI** (`app/cli.js`) — запускайте агента без інтерактивності, передавайте NDJSON-події у скрипти/CI:
  ```bash
  node app/cli.js "fix the failing test" --workspace . --mode auto --max-iterations 30 --json-lines
  ```
- **Розширення VS Code** (`extension/`) — запускає CLI в панелі чату: живий потік викликів інструментів, дії з кодовими блоками (Insert / Write file) та **картки файлових diff**: кожен виклик `write_file` / `edit_file` / `apply_patch` рендерить построковий diff відносно вмісту файлу до змін, з одноразовим **Revert** (відновлює знімок, зроблений перед виконанням інструмента). Потребує налаштування розширення `aether.cliPath` (автоматично виявляється, коли репозиторій клоновано локально).
- **Локальний шлюз** (`127.0.0.1:35791`) — OpenAI-сумісний REST API на основі настільного застосунку (Settings → Local Gateway → token); через нього підключається друге розширення (`extensions/vscode-aether/`).

---

## Термінальний TUI, RPC і SDK

Окрім настільного застосунку та звичайного CLI, Aether постачає інтерактивний термінальний інтерфейс, доступний для машин JSONL RPC-режим і SDK без Electron. Усі три поділяють те саме ядро агента, пам'ять, персони, MCP-інструменти та правила дозволів, що й настільна версія.

### Швидкий старт — подвійна форма

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

Додаткові headless-прапорці: `--persona <id>` (ін'єкція persona + пам'ять), `--memory-trace` (звіт про кількість ін'єктованих записів пам'яті), `--skills` (JSON пропозицій навичок), `--setup-term` (запис профілю Windows Terminal), `--stdin` (явне конвеєрне введення).

### TUI (`aether tui`)

Інтерактивний термінальний агент (Ink v5; Node ≥ 22; найкраще працює у Windows Terminal):

- **Сеанси**: потоковий рендеринг повідомлень, дерево сеансів `/fork` (`session.parent_session_id`), `/sessions`, перемикання історії `/use <id>`
- **Інструменти та дозволи**: картки викликів інструментів (колір статусу / час / підсумок), перегляд diff (`Alt+v` розгорнути, `Enter` прийняти / `r` відкатити — відновлення знімка до запису, працює й у не-git каталогах), клавіатурні ворота дозволів (`y` дозволити один раз / `a` завжди дозволяти / `n` відхилити, або вибір через `←→`), автоматичний пропуск для інструментів тільки для читання
- **Режим затвердження**: `Shift+Tab` цикл `manual → auto-edits → plan` (plan = планування тільки для читання, після завершення три варіанти визначають, як впроваджувати)
- **Режими**: `Alt+m` перемикає ask/plan/auto; `/persona <id>` перемикає персону (ін'єкція persona + префікс пам'яті)
- **Гарячі клавіші leader**: `Ctrl+X` потім `m` селектор моделей / `n` новий сеанс / `l` список сеансів / `g` хронологія / `r` точка відкату rewind / `q` вихід
- **Палітра команд**: `Ctrl+P` або `x` (New chat / Model / Timeline / Export JSONL / Help / Quit)
- **Переналаштування клавіш**: `~/.config/aether/keybindings.json` (напр., `{ "char:?": null }` вимикає клавішу допомоги `?`)
- **Збереження API-ключа**: `/apikey <provider> <key>` зберігає в `auth.json` (ключ, зашифрований safeStorage у настільній версії, неможливо розшифрувати в headless; використовуйте цю команду або змінну середовища `AETHER_API_KEY`)
- **Замкнений цикл пам'яті та навичок**: пошук `/memory <ключове слово>`, `--memory-trace` кількість ін'єктованих записів, `/skills` + `/skill accept|dismiss <key>` (habitLearner → пропозиції навичок)
- **steering**: під час роботи `Ctrl+C` перериває → введіть наступний запит → ін'єкція в поточний цикл (черга показує `steer:n`); під час роботи `Tab` ставить наступний запит у чергу
- **Гарячі клавіші**: подвійне натискання `Esc` для виходу (або `/quit`), `Esc` очищає введення (чернетка потрапляє в історію), `?` екран довідки, `PgUp/PgDn`/колесо миші для гортання, рядок стану в реальному часі показує `approval/mode/model/tok/ctx`; повні клавіші див. у [docs/tui-keys.md](./docs/tui-keys.md)

### RPC (`aether --mode rpc`)

Доступний для машин JSONL-протокол через stdin/stdout: кадри `request` на вході, кадри `event`/`result`/`error` на виході — один JSON-об'єкт на рядок, без людського тексту. Методи: `run` (стрімить події `text`/`tool`/`plan`/`status`), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. Довідник кадрів: [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

Агрегація ядра агента без Electron для зовнішніх Node-проєктів: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, кадри `rpc`, `sessionContext` (ін'єкція persona + пам'ять). Включено декларації типів (`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Нативна інтеграція Windows

| Можливість | Опис |
|---|---|
| **Меню трея** | Показати/сховати вікно, новий сеанс, **нове завдання** (безпосередньо відкриває TaskPanel); клік по трею перемикає видимість. |
| **Глобальні гарячі клавіші** | `Ctrl+Alt+A` викликає головне вікно (створює, якщо не запущено); результат реєстрації записується в журнал запуску. |
| **Протокол `aetherai://`** | `aetherai://new` / `chat` створює новий сеанс; `aetherai://tui` показує термінальну форму; `aetherai://open/?path=<закодований шлях>` встановлює папку як робочий простір і створює новий сеанс (ланцюжок контекстного меню "Відкрити за допомогою Aether"). |
| **Реєстрація контекстного меню** | `app/resources/register-protocol.reg` (після заміни `<AETHER_EXE>` імпортуйте від адміністратора): `.cs/.js/.ts/.tsx/.md/.json` + папки → контекстне меню "Відкрити за допомогою Aether". |
| **Налаштування термінала** | `app/resources/term/aether.ps1` (аліас + запуск `aether tui`); `node app/cli.js --setup-term` записує профіль Windows Terminal (дві колірні схеми: темна/світла). |
| **Посилення пісочниці** | Захист Windows-шляхів: довгі шляхи `\\?\`, UNC `\\server\share`, втеча через reparse points/junction, небезпечні розширення, як-от `.lnk/.scr/.msi`. |

---

## Структура проєкту

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

## Технологічний стек

| Шар | Технологія |
|---|---|
| Робочий стіл | Electron 43 |
| Фронтенд | React 18.3 + TypeScript 5.8 |
| Стан | Zustand 4.5 |
| Збірка | Vite 8 + electron-builder |
| База даних | better-sqlite3 (нативний SQLite, режим WAL) |
| LLM | OpenAI-сумісний + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Власний stdio JSON-RPC 2.0 клієнт |
| TUI | Ink 5 + React 18 (createElement, без JSX) |
| CLI/SDK | Node.js headless CLI (4 режими) + SDK без Electron |

---

## Подяки

Aether стоїть на плечах цих проєктів — їхні ідеї сформували архітектуру та UX:

### Агентні фреймворки

| Проєкт | Джерело натхнення |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Модель дозволів агента, повзунок мислення, візуалізація викликів інструментів, делегування сабагентам, хуки |
| [OpenClaw](https://github.com/openclaw/openclaw) | Ущільнення контексту, виявлення циклів викликів інструментів, архітектура подієвих потоків |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Бюджет ітерацій, структурована довгострокова пам'ять, автономні навички |
| [OpenAI Codex](https://github.com/openai/codex) | Пісочниця, стиснення контексту, відновлення викликів інструментів |
| [DS4](https://github.com/antirez/ds4) | Ієрархічне розкладання завдань |

### UI & UX

| Проєкт | Джерело натхнення |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Методологія copy-paste компонентів cn() / cva |
| [Magic UI](https://github.com/magicuidesign/magicui) | Патерни анімації (shimmer, blur-fade) |

### Інфраструктура

| Проєкт | Джерело натхнення |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Нормалізація провайдерів різних форматів |
| [MCP](https://modelcontextprotocol.io) | Специфікація, якою говорить агент Aether |
| [cc-switch](https://github.com/farion1231/cc-switch) | Макет інформаційної панелі статистики використання |
| [new-api](https://github.com/QuantumNous/new-api) | Релей зусиль міркування, відстеження використання/вартості |
| [Continue](https://github.com/continuedev/continue) | Конфігурація як джерело істини, абстракція провайдерів |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Багатоходове виконання агента, виконання інструментів у пісочниці |
| [Aider](https://github.com/Aider-AI/aider) | Цикл інструментів LLM-асистента кодування, інтеграція git |
| [Cline](https://github.com/cline/cline) | Агент, вбудований в IDE, інтеграція MCP, UX дозволів |

---

## Внесок

Всі внески вітаються! Чи то виправлення помилок, запит функції, покращення перекладу чи оновлення документації — будь ласка, відкрийте issue або надішліть PR.

1. Форкніть репозиторій
2. Створіть гілку функції (`git checkout -b feat/my-feature`)
3. Закомітьте ваші зміни (`git commit -am 'Add feature'`)
4. Запуште в гілку (`git push origin feat/my-feature`)
5. Відкрийте Pull Request

Детальні вказівки див. у [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Ліцензія

[MIT](./LICENSE) © 2025 Aether

---

<div align="center">

Створено з ❤️ за допомогою Electron + React + TypeScript

[⬆ Вгору](#aether)

</div>
