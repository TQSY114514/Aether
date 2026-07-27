<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दీ](./README.hi.md) · [한국어](./README.ko.md)


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
- [🤝 شكر وتقدير](#-شكر-وتقدير)
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

<p align="center">
  <img src="assets/architecture.svg" width="100%" alt="AetherAI Architecture Overview">
</p>

---

