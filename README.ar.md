<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**عميل محلي أولاً لمعونة ذكاء اصطناعي متعدد النماذج على سطح المكتب · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **الحالة: تجريبي (beta).** AetherAI مشروع شخصي/هواية. يعمل، لكن توقع بعض الخشونة. تقارير الأخطاء مرحب بها — راجع [CONTRIBUTING.md](./CONTRIBUTING.md) و [SECURITY.md](./SECURITY.md).


يوحّد AetherAI عدّة مزوّدات LLM (OpenAI / Claude / DeepSeek / نماذج محلّية / أي نقطة نهاية متوافقة مع OpenAI) في تطبيق واحد لسطح المكتب. يُخزَّن كل شيء محليّاً — مفاتيح API ومحادثاتك لا تغادر جهازك إلّا إلى المزوّدين الذين تُهيّئهم.

## 📑 Table of Contents

- [✨ الميزات](#-الميزات)
  - [🖥️ المحادثة](#️-chat)
  - [🤖 الوكيل (استدعاء الدوال)](#-الوكيل-استدعاء-الدوال)
  - [🔒 الخصوصية](#-privacy)
- [🚀 البدء السريع](#-البدء-السريع)
- [📁 بنية المشروع](#-بنية-المشروع)
- [🗺️ خارطة الطريق](#️-خارطة-الطريق)
- [🤝 شكر وتقدير](#-شكر-وتقدير)
- [📋 Changelog](#-changelog)
- [📄 الترخيص](#-الترخيص)

---

## ✨ الميزات

### 🖥️ المحادثة

- **تجريد متعدد المزوّدين** — طبقة محوّل واحدة؛ إضافة صيغة مزوّد تعني ملفّاً واحداً. حالياً متوافق مع OpenAI (يغطّي OpenRouter و Together و DeepSeek و جسر OpenAI في Ollama و LM Studio و …).
- **بثّ متزامن متعدد الجلسات** — يمكن لمحادثة واحدة أن تبثّ بينما تواصل التحدّث في أخرى.
- **Arena** — موجّه واحد، عدّة نماذج تجيب دفعة واحدة؛ صوّت للأفضل ويتحدّث لوحة صدارة ELO تلقائيّاً.
- **الأشخاص (Personas)** — إعدادات محدّدة مسبقاً لموجّه النظام، قابلة للتبديل لكلّ جلسة.
- **المُرفقات** — تُحقن الملفّات النصّية كسياق؛ وتذهب الصور إلى النماذج متعددة الوسائط (تتطلّب نموذج رؤية).
- **طيّ اللصق الطويل** — يلصق مئات الأسطر فيُطوى تلقائيّاً إلى مقتطف قابل للتوسيع (على نمط ChatGPT).
- **مزلقة جهد التفكير** — وسائط حقيقيّة: سلسلة o من OpenAI ← `reasoning_effort`، و Claude ← `thinking.budget_tokens`.
- **ملخّصات الشريط الجانبي** — العناوين عبارات مواضيعيّة يولّدها النموذج (مثل "نصيحة سحب Eiyuu Angel الجديدة")، لا نصّ منسوخ.
- **إعدادات متقدّمة** — الحدّ الأقصى للرموز، الحرارة، top_p، بادئة نظام مخصّصة، عناوين تلقائيّة لكلّ لغة.
- **خلفيّة مخصّصة** — ارفع صورة مع ضبط العتامة / التمويه.
- **15 لغة واجهة** — English (قياسي + مقلوب)، 中文 (简体/繁體/文言)، 日本語، español، français، Deutsch، português، русский، українська، العربية (RTL)，हिन्दी، 한국어.
- **السمات** — فاتح / داكن / أزرق / زجاجي / كلاسيكي.
- **التخزين المحلي** — جميع البيانات في قاعدة بيانات SQLite محلّية؛ لا يُرفع شيء.

### 🤖 الوكيل (استدعاء الدوال)

- **13 أداة مدمجة** (`read_file` و `list_dir` و `glob_find` و `grep_search` و `web_search` و `web_fetch` و `write_file` و `edit_file` و `run_command` و `git_status` و `git_diff` و `memory_save` و `memory_list`) مع حلقة خطة ← فعل ← راقب وأثر استدلال حيّ.
- **أوضاع صلاحيات الوكيل** — مغلق / اسأل (تأكيد لكلّ أداة خطرة) / تلقائي (السماح بالكل) / تخطيط (للقراءة فقط). يعكس نموذج صلاحيات وكيل البرمجة.
- **دعم MCP** — وصِل خوادم MCP خارجية عبر stdio؛ تندمج أدواتها مع المدمجة تلقائيّاً.
- **Tool call repair** — الوكيلات (LLMs) تنتج أحياناً JSON معيوباً؛ حلقة الوكيل تصلح تلقائيّاً الوسائط المفقودة والمفاتيح غير المستشهد به والاستدعاءات المقطوعة قبل التنفيذ.

---

## 🚀 البدء السريع

### المتطلّبات المسبقة
- Node.js 18+
- npm 9+

### التثبيت والتشغيل
```bash
cd app
npm install
npm run dev      # التطوير (إعادة تحميل سريعة)
npm run build    # بناء الواجهة الأماميّة للإنتاج
npm start        # إطلاق Electron
```

أو شغّل `start.bat` في جذر المستودع على Windows.

### هيّئ أوّل مزوّد لديك
1. بعد الإطلاق، انقر **Models** في الشريط الجانبي.
2. أضف مزوّداً (الاسم / عنوان API للمفتاح / API Key).
3. انقر **Fetch models** لسحب قائمة النماذج المتاحة.
4. عُد إلى المحادثة وابدأ التحدّث.

---

## 📁 بنية المشروع

```
app/
├── electron/              # العملية الرئيسية (Node)
│   ├── database.js        # طبقة بيانات SQLite (sql.js)
│   ├── ipc/               # معالجات IPC (محادثة / arena / جلسة / mcp / ...)
│   ├── llm/               # تجريد LLM
│   │   ├── providerAdapter.js   # المُوزّع حسب api_format
│   │   ├── openaiAdapter.js     # تطبيق متوافق مع OpenAI
│   │   ├── reasoning.js         # باني وسيط جهد التفكير
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
│   ├── tools/             # سجلّ الأدوات المدمجة
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # عميل MCP + المدير
│   ├── main.js / preload.js
├── src/                   # العارض (React + TS)
│   ├── store/index.ts     # الحالة العامّة في zustand
│   ├── components/        # واجهة المستخدم (محادثة / شريط جانبي / إعدادات / واجهة)
│   ├── pages/             # محادثة / نماذج / شخص / إعدادات / نتائج / ...
│   ├── utils/             # i18n (15 لغة) / سمة / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, …)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## 🗺️ خارطة الطريق

| Milestone | Status | Description |
|-----------|--------|-------------|
| v0.5 — Agent foundation | ✅ | Tool loop, planning, sandbox, permissions, hooks |
| v0.6 — Memory & Skills | ✅ | Auto memory, habit learner, slash commands, tool repair |
| v0.7 — Quality & Polish | 🔄 | Error boundaries, perf profiling, test coverage |
| v0.8 — Multi-model polish | ⬜ | Arena UX, ELO calibration, intent-based routing |
| v0.9 — Plugins & Extensibility | ⬜ | Skill marketplace, hook sharing, plugin SDK |
| v1.0 — Stable release | ⬜ | Signed installer, auto-update, changelog generation |

---

## 🤝 شكر وتقدير

يقف AetherAI على أكتاف هذه المشاريع — فقد شكّلت أفكارها العمارة وتجربة الاستخدام:

- [Claude Code](https://github.com/anthropics/claude-code) — نموذج صلاحيات الوكيل، مزلقة جهد التفكير، تصوّر استدعاء الأدوات، الحالة الفارغة لمحادثة جديدة.
- [Continue](https://github.com/continuedev/continue) — التهيئة التصريحية كمصدر للحقيقة، تجريد المزوّد، بروتوكول استدعاء الدوال.
- [Dify](https://github.com/langgen/dify) — أنماط تسوية المزوّد متعدّد الصيغ.
- [Model Context Protocol](https://modelcontextprotocol.io) — مواصفة MCP التي يتحدّث بها وكيل AetherAI.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — منهجية المكوّنات القابلة للنسخ واللصق عبر `cn()` / `cva`.
- [Magic UI](https://github.com/magicuidesign/magicui) — أنماط الحركة (بثّ النصّ، الوميض، تلاشٍ بالضباب).
- [new-api](https://github.com/QuantumNous/new-api) — مرجع تحويل ترحيل جهد الاستدلال.
- [OpenClaw](https://github.com/openclaw/openclaw) — صقل الـ README وإلهام الإعداد الأوّلي.
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

## 📄 الترخيص

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
