<div align="center">

<p align="center">
  <img src="./assets/banner.svg" width="512" alt="AetherAI Banner" />
</p>

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)
---

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)


---

> **الحالة: تجريبي (beta).** AetherAI مشروع شخصي/هواية. يعمل، لكن توقع بعض الخشونة. تقارير الأخطاء مرحب بها — راجع [CONTRIBUTING.md](./CONTRIBUTING.md) و [SECURITY.md](./SECURITY.md).


يوحّد AetherAI عدّة مزوّدات LLM (OpenAI / Claude / DeepSeek / نماذج محلّية / أي نقطة نهاية متوافقة مع OpenAI) في تطبيق واحد لسطح المكتب. يُخزَّن كل شيء محليّاً — مفاتيح API ومحادثاتك لا تغادر جهازك إلّا إلى المزوّدين الذين تُهيّئهم.

---

## 🎯 ما الذي يميّز AetherAI

يُدمج AetherAI عدّة قدرات تكون عادةً موزّعة عبر أدوات كثيرة في تطبيق واحد لسطح المكتب محليّ:

|Capability|الوصف|النضج|
|---|---|:---:|
|**محاددة متعدّدة المزوّدات**|التبديل بين OpenAI و Claude و DeepSeek وأي نقطة نهاية متوافقة مع OpenAI أثناء المحادثة.|`مستقر`|
|**حلقة أدوات الوكيل**|16 أداة مدمجة مع حلقة خطّ-تنفّذ-راقب، وكسوة (sandboxing)، وسلم الصلاحيات.|`بيتا`|
|**ساحة متعدّدة النماذج**|أرسل موجهّاَ واحداً إلى نماذجَ متعددة، وصوّت للأفضل، وتتبع ترتيب ELO.|`بيتا`|
|**المهارات والتوسعة**|ملفات `SKILL.md` جاهزة للإسقاط، وخوادم MCP، ونظام 10 نقاط للخطافات (hooks).|`تجريبي`|
|**ذاكرة هيكلية**|يُذكّر الوكيل بالتفضيلات والقرارات الماضية عبر الجلسات.|`بيتا`|
|**تخطيط تسلسليّ**|المطلوبات المعقّدة تتحلّل تلقائياً إلى مهام فرعية متوازية.|`تجريبي`|
|**انكماش السياق**|المحادثات الطويلة تُلخّص تلقائياً بدون فقدان أزواج استدعاء الأداة.|`بيتا`|
|**خصوصية محلية أولاً**|المحادثات والمفاتيح والشخصيات في SQLite محلي. لا شيء يغادر جهازك.|`مستقر`|
|**15 لغة واجهة**|بما فيها الصينية الكلاسيكية (文言) والعربية (RTL).|`بيتا`|
|**مرخّص MIT**|مفتوح المصدر بالكامل.|`مستقر`|

---

## ✨ الميزات

**شارات الحالة:** `مستقر` = جاهز للاستخدام اليومي، `بيتا` = صالح للاستخدام مع حدود معروفة، `تجريبي` = سلوك جديد/متقدّم قد يتغيّر، `مخطّط` = عنصر موثّق في خارطة الطريق.

### 🖥️ المحادثة

| الميزة | الحالة | الوصف |
|---|:---:|---|
| **تعدّد المزوّدات** | `مستقر` | طبقة محوّل واحدة؛ إضافة مزوّد = ملف واحد. يغطّي OpenRouter و Together و DeepSeek و Ollama و LM Studio و ... |
| **بثّ متزامن** | `مستقر` | واحدة تبثّ بينما تواصل التحدّث في الأخرى. |
| **مزلقة جهد التفكير** | `بيتا` | معلمات حقيقية: OpenAI o-series / gpt-5 / Claude عبر وسيط. فعّال فقط مع نماذج الاستدلال. |
| **المرفقات** | `بيتا` | ملفات نصية كسياق؛ صور لل multimodal (تحتاج نموذج رؤية). |
| **طيّ اللصق الطويل** | `مستقر` | مئات الأسطر تُطوى تلقائياً إلى مقتطف قابل للتوسيع (بنمط ChatGPT). |
| **تحرير الرسالة** | `مستقر` | الكتابة فوق إعادة التوليد من أي نقطة. |
| **بحث الرسالة** | `مستقر` | مع التمييز عبر جميع الرسائل. |
| **ملخّصات الشريط الجانبي** | `بيتا` | عبارات مواضيعيَّة يولّدها النموذج، وليس نصّاً منسوخاً. |

### 🤖 الوكيل (استدعاء الدوال)

- `بيتا` **16 أداة مدمجة** (`read_file`، `list_dir`، `glob_find`، `grep_search`، `web_search`، `web_fetch`، `write_file`، `edit_file`، `run_command`، `git_status`، `git_diff`، `memory_save`، `memory_list`، `use_skill`، `ask_user`، `todo_write`) مع حلقة خطّ-تنفّذ-راقب، وتتبع استدلال حيّ + قائمة مهام، وكشف حلقات، وحدود زمنية لكل أداة، وميزانية تكرار قابلة للتكوين (25 جولة افتراضياً)، وانكماش سياق.
- `تجريبي` **تخطيط تسلسليّ** — يولّد تلقائياً تفكيك المهام للمطلوبات المعقّدة (مُلهَم من DS4).
- `تجريبي` **تفويض الوكيل الفرعيّ** — المهام الفرعية المستقلّة تعمل بالتوازي عبر `delegate_task`.
- `مستقر` **أوضاع الصلاحيات** — سلم تصاعديّ للمخاطر:

| الوضع | الوصف | الساند بوكس |
|---|---|:---:|
| **مغلق** | محادثة عاديّة، لا أدوات | غير منصّف |
| **مخطّط** | أدوات للقراءة فقط (تحقيق بدون تغييرات) | - |
| **اسأل** | تأكيد كل إجراء خطر (مُنصَح به) | - |
| **تلقائي** | تشغُل كل شيء بدون تأكيد | نعم |
| **Yolo** | صلاحية كاملة بدون ساند بوكس | لا |

- `مستقر` **كسوة مساحة العمل** — يُرفض `write_file`/`edit_file` خارج جذر مساحة العمل المُضبوط؛ تُوقف `run_command` الأنماط المدمّرة. قابلة للتكوين في الإعدادات - الوكيل والسلامة.
- `بيتا` **انكماش السياق** — يلخّص التاريخ الأقدم تلقائياً (أزواج استدعاء/نتيجة الأداة محفوظة؛ المُعرّفات محفوظة بحرفيتها).
- `بيتا` **إصلاح استدعاء الأداة** — يُصلح تلقائياً JSON المعيب والمعاملات المفقودة والمفاتيح غير المُشار إليها والاستدعاءات المقطوعة.

### 🧠 الذاكرة والتعلّم

- `بيتا` **ذاكرة طويلة الأمد تلقائية** — تُحقَن الذكريات ذات الصلة قبل كل دور؛ تُستخرج الحقائق الرئيسية وتُحفظ تلقائياً. قابل للتبديل في الإعدادات - الوكيل.
- `تجريبي` **مُعلّم العادات** — يكتشف التفضيلات المتكرّرة (مثال: "استخدم Claude دائماً") ويقترح مهارات تُطبّق تلقائياً.
- `بيتا` **سجل التدقيق** — تتبع تنفيذ الوكيل لكل دور للت debugging.

### 🏟️ الساحة

- `بيتا` **ساحة متعدّدة النماذج** — موجه واحد، نماذج متعدّدة تُجيب **بالتوازي**؛ صوّت للأفضل و **لوحة صدارة ELO** تُحدّث تلقائياً. تُقيّم النماذج **بحسب النية** (برمجة / رياضيات / ترجمة / تلخيص / عام). *لا يوجد تطبيق محادثة لسطح المكتب المحلي الآخر الذي يُزوّد بساحة متعدّدة النماذج مدمجة مع ELO.*

### 🛠️ المهارات والتوسعة

| المكوّن | التنسيق | الحالة | التفاصيل |
|---|---|:---:|---|
| **المهارات** | `SKILL.md` | `تجريبي` | ألقِ في `<مساحة_العمل>/.claude/skills/`؛ يأتي مع `release-checklist` و `git-commit` |
| **أوامر الشريط المائل** | `CMD.md` | `مستقر` | 6 مدمجة: `/code`، `/continue`، `/explain`، `/polish`، `/summarize`، `/translate` |
| **الخطافات** | نص برمجي | `تجريبي` | 10 نقاط دورة حياة: PreToolUse، PostToolUse، ToolError، PreCompact، PostCompact، PreSend، PostResponse، SessionStart، SessionEnd، SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `بيتا` | خوادم MCP الخارجية تندمج مع الأدوات المدمجة تلقائياً |

### ⚙️ التخصيص

| الإعداد | الحالة | الوصف |
|---|:---:|---|
| **إعدادات النموذج المتقدّمة** | `مستقر` | الحدّ الأقصى للرموز، ودرجة الحرارة، و top_p، والسبّاق النظامي المخصص، والعناوين التلقائية لكل لغة، وجهد التفكير |
| **خلفية مخصّصة** | `مستقر` | ارفع صورة مع ضوابط الشفافية / الضبابية |
| **الشخصيات** | `مستقر` | إعدادات مسبقة لموجّه النظام، قابلة للتبديل لكل جلسة |
| **السِمات** | `مستقر` | فاتح / داكن / أزرق / زجاجي / كلاسيكي |
| **15 لغة واجهة** | `بيتا` | الإنجليزية، الصينية (المبسّطة/التقليدية/الكلاسيكية)، اليابانية، الإسبانية، الفرنسية، الألمانية، البرتغالية، الروسية، الأوكرانية، العربية (RTL)، الهنّدية، الكورية |
| **التحديث التلقائي** | `بيتا` | مُثبّت NSIS يتحقّق عند الإطلاق؛ المحمول يتحقّق أيضاً (تثبيت يدوي) |
| **تتبُع الاستخدام** | `بيتا` | سجل لكل استدعاء API مع الرموز والتكلفة والزمن ومعدل إصابة المخبأ |

### 🔒 الخصوصية

> **كل البيانات تبقى محليّا.** AetherAI لا يجمع شيئاً ولا يرفع شيئاً عنك. مفاتيح API ومحادثاتك وشخصياتك في قاعدة بيانات SQLite محليّة. طلبات الشبكة الخارجيّة الوحيدة تذهب إلى مزوّدي LLM الذين ضبطتهم.

---

## 📸 لقطات الشاشة

> التقِ لقطات الشاشة تحت `assets/screenshots/` وأعد تحديث المسارات أدناه.

| التدفق | المعاينة |
|---|:---:|
| بث المحادثة | `assets/screenshots/chat-streaming.gif` — _قيد الإنجاز_ |
| تنفيذ أدوات الوكيل | `assets/screenshots/agent-tool-execution.gif` — _قيد الإنجاز_ |
| تصويت الساحة | `assets/screenshots/arena-voting.gif` — _قيد الإنجاز_ |
| إعدادات المزوّد | `assets/screenshots/provider-settings.png` — _قيد الإنجاز_ |

---

## 📦 التحميل

### Windows — مُنشأ مسبقاً (مُنصَح به)

حمِل أحدث [إصدار](https://github.com/TQSY114514/AetherAI/releases):

| الإصدار | الوصف |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | مُثبّت NSIS. لكل مستخدم (بدون صلاحيات مدير)، تحديث تلقائي داخل التطبيق. **مُنصَح به.** |
| **`AetherAI-x.y.z.exe`** | قابلة للنقل، ملف تنفيذي واحد. بدون تثبيت، بدون تحديث تلقائي؛ فقط شغله. |

> يُظهر المُثبّت تحذير SmartScreen "ناشر غير معروف" عند الإطلاق الأوّل — متوقّع لتطبيق هواية غير موقّع. كل البيانات تبقى محليّا.

---

## 🚀 البدء السريع

### التثبيت من المصدر

**المطلوبات المسبقة:** Node.js 18+، npm 9+

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

### تفعيل وضع اسأل

1. افتح **الإعدادات - الوكيل والسلامة**.
2. اضبط وضع صلاحية الوكيل إلى **اسأل**.
3. تأكّد من أن جذر مساحة العمل هو المجلد الذي تريد أن يقرأ فيه الوكيل ويكتب.
4. اترك **Yolo** مُعطّلاً ما لم تكن تريد وصولاً غير مقيد.

### شغّل أول مهمة وكيل

1. افتح محادثة جديدة.
2. اطلب: `List the files in this project and summarize what the app does.`
3. راجِع كل استدعاء أداة مُقترح. أوافق على القراءات الآمنة؛ ارفض أي شيء غير متوقّع.
4. راجِع تتبع الاستدلال الحيّ والجواب النهائي.

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

## 🔑 التقانة المستعملة

| الطبقة | التقانة |
|---|---|
| سطح المكتب | Electron 31 |
| الواجهة الأمامية | React 18.3 + TypeScript 5.5 |
| إدارة الحالة | Zustand 4.5 |
| الإنشاء | Vite 5.4 + electron-builder |
| قاعدة البيانات | sql.js (SQLite في الذاكرة، محفوظ على القرص) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| الواجهة | Tailwind CSS 3.4، lucide-react، highlight.js |
| MCP | عميل stdio JSON-RPC 2.0 مخصّص |

---

## 🤝 شكر وتقدير

AetherAI يقوم على أكتاف هذه المشاريع — أفكارها شكّلت البنية والخبرة:

### أطر العمل الوكيلائية

| المشروع | الإلهام |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | نموذج صلاحية الوكيل، مزلقة التفكير، تصوير استدعاء الأداة، تفويض الوكيل الفرعيّ، الخطافات |
| [OpenClaw](https://github.com/openclaw/openclaw) | انكماش السياق، كشف حلقة استدعاء الأداة، بنية تدفق الأحداث |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | ميزانية التكرار، الذاكرة طويلة الأمد المهيكلّة، المهارات المستقلّة |
| [OpenAI Codex](https://github.com/openai/codex) | الكسوة، ضغط السياق، إصلاح استدعاء الأداة |
| [DS4](https://github.com/antirez/ds4) | التحلّل التسلسليّ للمهام |

### الواجهة والخبرة

| المشروع | الإلهام |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | طريقة المكونات المنسوخة cn() / cva |
| [Magic UI](https://github.com/magicuidesign/magicui) | أنماط الحركة (توهّج، تلاشي ضبابي) |

### البنية التحتية

| المشروع | الإلهام |
|---|---|
| [Dify](https://github.com/langgenius/dify) | تطبيع المزوّدات متعدّدة الصيغ |
| [MCP](https://modelcontextprotocol.io) | المواصفة التي يتكلّم بها وكيل AetherAI |
| [cc-switch](https://github.com/farion1231/cc-switch) | تخطيط لوحة إحصائيات الاستخدام |
| [new-api](https://github.com/QuantumNous/new-api) | وسيط جهد الاستدلال، تتبع الاستخدام/التكلفة |
| [Continue](https://github.com/continuedev/continue) | التكوين كمصدر للحقيقة، تجريد المزوّد |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | تنفيذ وكيل متعدّد الأدوار، تنفيذ الأدوات في كسوة |
| [Aider](https://github.com/Aider-AI/aider) | حلقة أدوات مساعد البرمجة بالLLM، التكامل مع git |
| [Cline](https://github.com/cline/cline) | وكيل مدمج في IDE، تكامل MCP، خبرة الصلاحيات |

---

## 🤝 المساهمة

كل المساهمات مرحّب بها! إمّا إصلاح خطأ، أو طلب ميزة، أو تحسين ترجمة، أو تحديث التوثيق — افتح مسألة أو قدّم طلب دمج (PR).

1. انسخ المستودع (Fork)
2. أنشئ فرع ميزة (`git checkout -b feat/my-feature`)
3. التزم تغييراتك (`git commit -am 'Add feature'`)
4. ادفع للفرع (`git push origin feat/my-feature`)
5. افتح طلب دمج (Pull Request)

انظر [CONTRIBUTING.md](./CONTRIBUTING.md) للتوجيهات المفصّلة.

---

## 📄 الترخيص

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

بُني بـ ❤️ باستخدام Electron + React + TypeScript

[⬆ إلى الأعلى](#-aetherai)

</div>

