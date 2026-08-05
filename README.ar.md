<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### تحدّث مع أي نموذج، وشغّل وكيل برمجة آمنًا، وقارن النماذج جنبًا إلى جنب — كل ذلك على جهازك

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `مشروع فردي/هواية` · `مرخّص MIT`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **الحالة: Beta.** AetherAI مشروع فردي/هواية. يعمل، لكن توقّع بعض الخشونة. تقارير الأخطاء مرحب بها — راجع [CONTRIBUTING.md](./CONTRIBUTING.md) و [SECURITY.md](./SECURITY.md).

يوحّد AetherAI عدّة مزوّدات LLM — OpenAI / Claude / DeepSeek / نماذج محلّية / أي نقطة نهاية متوافقة مع OpenAI — في تطبيق واحد لسطح المكتب. تحدّث، وشغّل وكيل برمجة، وقارن النماذج وجهًا لوجه في ساحة متعدّدة النماذج مع تصويت ELO.

**محلّي أولاً بالتصميم.** مفاتيح API ومحادثاتك في قاعدة بيانات SQLite محلّية، ولا تغادر جهازك أبدًا — إلّا إلى المزوّدين الذين تُهيّئهم.

**آمن افتراضيًا.** الوكيل المدمج يعمل داخل صندوق رمل لمساحة العمل مع سلم صلاحيات: الوصول إلى الملفات والأوامر يُوافَق عليه قبل تنفيذه، وكل استدعاء أداة قابل للتدقيق.

---

## ما الذي يميز AetherAI

يُدمج AetherAI عدّة قدرات تكون عادةً موزّعة عبر أدوات متعدّدة في تطبيق واحد لسطح المكتب محلّي:

| القدرة | الوصف | النضج |
|---|---|:---:|
| **محادثة متعدّدة المزوّدات** | بدّل بين OpenAI و Claude و DeepSeek وأي نقطة نهاية متوافقة مع OpenAI أثناء المحادثة. | `Stable` |
| **حلقة أدوات الوكيل** | 16 أداة مدمجة مع حلقة خطّط-نفّذ-راقب، وصندوق رمل، وسلم صلاحيات. | `Beta` |
| **ساحة متعدّدة النماذج** | أرسل موجّهاً واحداً إلى نماذج متعدّدة، صوّت للأفضل، وتتبّع ترتيب ELO. | `Beta` |
| **المهارات والتوسعة** | ملفات `SKILL.md` جاهزة للإسقاط، وخوادم MCP، ونظام خطّافات من 10 نقاط. | `Experimental` |
| **ذاكرة مهيكلة** | يتذكّر الوكيل التفضيلات والقرارات الماضية عبر الجلسات. | `Beta` |
| **تخطيط هرميّ** | الطلبات المعقّدة تُفكَّك تلقائياً إلى مهام فرعية متوازية. | `Experimental` |
| **انكماش السياق** | المحادثات الطويلة تُلخَّص تلقائياً بدون فقدان أزواج استدعاء الأداة. | `Beta` |
| **خصوصية محلّية أولاً** | المحادثات والمفاتيح والشخصيات في SQLite محلّي. لا شيء يغادر جهازك. | `Stable` |
| **15 لغة واجهة** | بما فيها الصينية الكلاسيكية (文言) والعربية (RTL). | `Beta` |
| **مرخّص MIT** | مفتوح المصدر بالكامل. | `Stable` |

---

## التنزيل

### Windows — مُثبّت جاهز مسبقاً (مُوصى به لمعظم المستخدمين)

حمّل أحدث [إصدار](https://github.com/TQSY114514/Aether/releases):

| البناء | الوصف |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | مُثبّت NSIS. لكل مستخدم (بدون صلاحيات مدير)، تحديث تلقائي داخل التطبيق. **مُوصى به.** |
| **`AetherAI-x.y.z.exe`** | ملف تنفيذي واحد محمول. بدون تثبيت، بدون تحديث تلقائي؛ فقط شغّله. |

> يُظهر المُثبّت تحذير SmartScreen "ناشر غير معروف" عند الإطلاق الأوّل — متوقّع لتطبيق غير موقّع من مطوّر فردي. كل البيانات تبقى محلّية.
>
> ⚠️ قد تعزل بعض برامج مكافحة الفيروسات ملف `electron.exe` غير المُفكّ أثناء التعبئة لأن التطبيق غير موقّع. إذا أزال مضاد الفيروسات المُثبّت، أضف استثناءً أو استخدم البناء المحمول.

### التشغيل من المصدر (مطوّرون / مستخدمون متقدّمون)

إذا فضّلت التشغيل من المصدر، أو أردت تعديل الكود، استخدم `start.bat` (يتطلّب [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: يُثبّت التبعيات، يبني الواجهة الأمامية، يُطلق Electron
```

انظر [البداية السريعة](#-quick-start) للخطوات اليدوية خطوة بخطوة.

> **exe مقابل start.bat** — كلاهما مدعوم ويخدمان جمهوراً مختلفاً:
> - **مُثبّت exe** — للمستخدمين النهائيين: نقر مزدوج للتثبيت، إدخال في قائمة ابدأ، تحديث تلقائي داخل التطبيق، لا يحتاج Node.js.
> - **start.bat** — للمطوّرين والمُجرّبين: مسار شفّاف `npm install` ← `vite build` ← `electron .`، حرّر وشغّل، يتطلّب Node.js.

---

## البداية السريعة

**المتطلّبات المسبقة:** Node.js 18+، npm 9+

```bash
cd app
npm install
npm run dev      # تطوير (إعادة تحميل سريع)
npm run build    # واجهة أمامية للإنتاج
npm start        # إطلاق Electron
```

أو شغّل `start.bat` في جذر المستودع على Windows.

### ضبط المزوّد

1. بعد الإطلاق، انقر **Models** في الشريط الجانبي.
2. أضف مزوّداً (اسم / عنوان URL للواجهة / مفتاح API).
3. انقر **Fetch models** لسحب قائمة النماذج المتاحة.
4. عُد إلى المحادثة وابدأ التحدّث.

### تفعيل وضع Ask

1. افتح **الإعدادات - الوكيل والسلامة**.
2. اضبط وضع صلاحية الوكيل إلى **Ask**.
3. تأكّد من أن جذر مساحة العمل هو المجلد الذي تريد أن يقرأ فيه الوكيل ويكتب.
4. اترك **Yolo** مُعطّلاً ما لم تكن تريد وصولاً غير مقيّد.

### شغّل أوّل مهمة وكيل

1. افتح محادثة جديدة.
2. اطلب: `List the files in this project and summarize what the app does.`
3. راجِع كل استدعاء أداة مُقترح. وافق على القراءات الآمنة؛ ارفض أي شيء غير متوقّع.
4. راجِع تتبّع الاستدلال الحيّ والجواب النهائي.

---

## الميزات

**شارات الحالة:** `Stable` = جاهز للاستخدام اليومي، `Beta` = صالح للاستخدام مع حوافّ خشنة معروفة، `Experimental` = سلوك جديد/متقدّم قد يتغيّر، `Planned` = عنصر موثّق في خارطة الطريق.

### المحادثة

| الميزة | الحالة | الوصف |
|---|:---:|---|
| **تعدّد المزوّدات** | `Stable` | طبقة محوّل واحدة؛ إضافة مزوّد = ملف واحد. يغطّي OpenRouter و Together و DeepSeek و Ollama و LM Studio و ... |
| **بثّ متزامن** | `Stable` | محادثة واحدة تبثّ بينما تواصل التحدّث في أخرى. |
| **مزلقة جهد التفكير** | `Beta` | معاملات حقيقية: OpenAI o-series / gpt-5 / Claude عبر وسيط. فعّال فقط على نماذج الاستدلال. |
| **المرفقات** | `Beta` | ملفات نصية كسياق؛ صور للـ multimodal (يتطلّب نموذج رؤية). |
| **طيّ اللصق الطويل** | `Stable` | مئات الأسطر تُطوى تلقائياً إلى مقتطف قابل للتوسيع (بنمط ChatGPT). |
| **تحرير الرسالة** | `Stable` | كتابة فوق + إعادة توليد من أي نقطة. |
| **بحث الرسالة** | `Stable` | مع التمييز عبر جميع الرسائل. |
| **ملخّصات الشريط الجانبي** | `Beta` | عبارات مواضيعية يولّدها النموذج، وليس نصّاً منسوخاً. |

### الوكيل (استدعاء الدوال)

- `Beta` **16 أداة مدمجة** (`read_file`، `list_dir`، `glob_find`، `grep_search`، `web_search`، `web_fetch`، `write_file`، `edit_file`، `run_command`، `git_status`، `git_diff`، `memory_save`، `memory_list`، `use_skill`، `ask_user`، `todo_write`) مع حلقة خطّط-نفّذ-راقب، وتتبّع استدلال حيّ + قائمة مهام، وكشف الحلقات، ومهلات زمنية لكل أداة، وميزانية تكرار قابلة للتكوين (25 جولة افتراضياً)، وانكماش السياق.
- `Experimental` **تخطيط هرميّ** — يولّد تلقائياً تفكيك المهام للطلبات المعقّدة (مُلهَم من DS4).
- `Experimental` **تفويض الوكيل الفرعيّ** — المهام الفرعية المستقلّة تعمل بالتوازي عبر `delegate_task`.
- `Stable` **أوضاع الصلاحيات** — سلم تصاعديّ للمخاطر:

| الوضع | الوصف | صندوق الرمل |
|---|---|:---:|
| **Off** | محادثة عاديّة، لا أدوات | غير قابل للتطبيق |
| **Plan** | أدوات للقراءة فقط (تحقيق بدون تغييرات) | - |
| **Ask** | أكّد كل إجراء خطر (مُوصى به) | - |
| **Auto** | شغّل كل شيء، بدون تأكيدات | نعم |
| **Yolo** | صلاحية كاملة، بدون صندوق رمل | لا |

- `Stable` **صندوق رمل مساحة العمل** — يُرفض `write_file`/`edit_file` خارج جذر مساحة العمل المُعدّ؛ يُوقف `run_command` الأنماط المدمّرة. قابل للتكوين في الإعدادات - الوكيل والسلامة.
- `Beta` **انكماش السياق** — يُلخّص التاريخ الأقدم تلقائياً (أزواج استدعاء/نتيجة الأداة محفوظة سليمة؛ المُعرّفات محفوظة بحرفيتها).
- `Beta` **إصلاح استدعاء الأداة** — يُصلح تلقائياً JSON المعيب، والمعاملات المفقودة، والمفاتيح غير المُشار إليها، والاستدعاءات المقطوعة.

### الذاكرة والتعلّم

- `Beta` **ذاكرة طويلة الأمد تلقائية** — تُحقن الذكريات ذات الصلة قبل كل دور؛ تُستخرج الحقائق الرئيسية وتُحفظ تلقائياً. قابلة للتبديل في الإعدادات - الوكيل.
- `Experimental` **مُعلّم العادات** — يكتشف التفضيلات المتكرّرة (مثال: "استخدم Claude دائماً") ويقترح مهارات تُطبّق تلقائياً.
- `Beta` **سجل التدقيق** — تتبّع تنفيذ الوكيل لكل دور لأغراض التصحيح.

### الساحة

- `Beta` **ساحة متعدّدة النماذج** — موجّه واحد، نماذج متعدّدة تُجيب **بالتوازي**؛ صوّت للأفضل و**لوحة صدارة ELO** تُحدّث تلقائياً. تُقيّم النماذج **حسب النية** (برمجة / رياضيات / ترجمة / تلخيص / عام). *لا يوجد تطبيق محادثة آخر لسطح المكتب محلّي يأتي بساحة متعدّدة النماذج مدمجة مع ELO.*

### المهارات والتوسعة

| المكوّن | التنسيق | الحالة | التفاصيل |
|---|---|:---:|---|
| **المهارات** | `SKILL.md` | `Experimental` | ألقِ في `<workspace>/.claude/skills/`؛ يأتي مع `release-checklist` و `git-commit` |
| **أوامر الشرطة المائلة** | `CMD.md` | `Stable` | 6 مدمجة: `/code`، `/continue`، `/explain`، `/polish`، `/summarize`، `/translate` |
| **الخطّافات** | نص برمجي | `Experimental` | 10 نقاط دورة حياة: PreToolUse، PostToolUse، ToolError، PreCompact، PostCompact، PreSend، PostResponse، SessionStart، SessionEnd، SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | خوادم MCP الخارجية تندمج مع الأدوات المدمجة تلقائياً |

### التخصيص

| الإعداد | الحالة | الوصف |
|---|:---:|---|
| **إعدادات النموذج المتقدّمة** | `Stable` | الحدّ الأقصى للرموز، ودرجة الحرارة، و top_p، وبادئة نظام مخصّصة، وعناوين تلقائية لكل لغة، وجهد التفكير |
| **خلفية مخصّصة** | `Stable` | ارفع صورة مع ضوابط الشفافية / الضبابية |
| **الشخصيات** | `Stable` | إعدادات مسبقة لموجّه النظام، قابلة للتبديل لكل جلسة |
| **السِمات** | `Stable` | فاتح / داكن / أزرق / زجاجي / كلاسيكي |
| **15 لغة واجهة** | `Beta` | الإنجليزية، الصينية (مبسّطة/تقليدية/كلاسيكية)، اليابانية، الإسبانية، الفرنسية، الألمانية، البرتغالية، الروسية، الأوكرانية، العربية (RTL)، الهنديّة، الكورية |
| **التحديث التلقائي** | `Beta` | مُثبّت NSIS يتحقّق عند الإطلاق؛ المحمول يتحقّق أيضاً (تثبيت يدوي) |
| **تتبّع الاستخدام** | `Beta` | سجل لكل استدعاء API مع الرموز والتكلفة والزمن ومعدل إصابة المخبأ |

### الخصوصية

> **كل البيانات تبقى محلّية.** AetherAI لا يجمع شيئاً ولا يرفع شيئاً عنك. مفاتيح API ومحادثاتك وشخصياتك في قاعدة بيانات SQLite محلّية. طلبات الشبكة الخارجيّة الوحيدة تذهب إلى مزوّدي LLM الذين ضبطتهم.

---

## هيكل المشروع

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

## التقنيات المستخدمة

| الطبقة | التقنية |
|---|---|
| سطح المكتب | Electron 31 |
| الواجهة الأمامية | React 18.3 + TypeScript 5.5 |
| إدارة الحالة | Zustand 4.5 |
| البناء | Vite 5.4 + electron-builder |
| قاعدة البيانات | sql.js (SQLite في الذاكرة، يُحفظ على القرص) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| الواجهة | Tailwind CSS 3.4، lucide-react، highlight.js |
| MCP | عميل stdio JSON-RPC 2.0 مخصّص |

---

## شكر وتقدير

يقف AetherAI على أكتاف هذه المشاريع — أفكارها شكّلت البنية والخبرة:

### أطر العمل الوكيلائية

| المشروع | الإلهام |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | نموذج صلاحية الوكيل، مزلقة التفكير، تصوير استدعاء الأداة، تفويض الوكيل الفرعيّ، الخطّافات |
| [OpenClaw](https://github.com/openclaw/openclaw) | انكماش السياق، كشف حلقة استدعاء الأداة، بنية تدفق الأحداث |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | ميزانية التكرار، الذاكرة طويلة الأمد المهيكلة، المهارات المستقلّة |
| [OpenAI Codex](https://github.com/openai/codex) | صندوق الرمل، ضغط السياق، إصلاح استدعاء الأداة |
| [DS4](https://github.com/antirez/ds4) | التفكيك الهرميّ للمهام |

### الواجهة والخبرة

| المشروع | الإلهام |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | منهجية المكوّنات المنسوخة القابلة للصق cn() / cva |
| [Magic UI](https://github.com/magicuidesign/magicui) | أنماط الحركة (توهّج، تلاشي ضبابي) |

### البنية التحتية

| المشروع | الإلهام |
|---|---|
| [Dify](https://github.com/langgenius/dify) | تطبيع المزوّدات متعدّدة الصيغ |
| [MCP](https://modelcontextprotocol.io) | المواصفة التي يتكلّم بها وكيل AetherAI |
| [cc-switch](https://github.com/farion1231/cc-switch) | تخطيط لوحة إحصائيات الاستخدام |
| [new-api](https://github.com/QuantumNous/new-api) | وسيط جهد الاستدلال، تتبّع الاستخدام/التكلفة |
| [Continue](https://github.com/continuedev/continue) | التكوين كمصدر للحقيقة، تجريد المزوّد |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | تنفيذ وكيل متعدّد الأدوار، تنفيذ الأدوات في صندوق الرمل |
| [Aider](https://github.com/Aider-AI/aider) | حلقة أدوات مساعد البرمجة بالـ LLM، التكامل مع git |
| [Cline](https://github.com/cline/cline) | وكيل مدمج في IDE، تكامل MCP، خبرة الصلاحيات |

---

## المساهمة

كل المساهمات مرحّب بها! سواء كان إصلاح خطأ، أو طلب ميزة، أو تحسين ترجمة، أو تحديث توثيق — افتح مسألة أو قدّم طلب دمج (PR).

1. انسخ المستودع (Fork)
2. أنشئ فرع ميزة (`git checkout -b feat/my-feature`)
3. التزم تغييراتك (`git commit -am 'Add feature'`)
4. ادفع للفرع (`git push origin feat/my-feature`)
5. افتح طلب دمج (Pull Request)

انظر [CONTRIBUTING.md](./CONTRIBUTING.md) للتوجيهات المفصّلة.

---

## الترخيص

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

بُني بـ ❤️ باستخدام Electron + React + TypeScript

[⬆ العودة إلى الأعلى](#aetherai)

</div>
