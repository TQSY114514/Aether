<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दీ](./README.hi.md) · [한국어](./README.ko.md)


---

> **स्थिति: बीटा।** AetherAI एक व्यक्तिगत/शौकिया परियोजना है। यह काम करता है, लेकिन खुरदरापन होगा। बग रिपोर्ट का स्वागत है — [CONTRIBUTING.md](./CONTRIBUTING.md) और [SECURITY.md](./SECURITY.md) देखें।


AetherAI कई LLM प्रदाताओं (OpenAI / Claude / DeepSeek / स्थानीय मॉडल / कोई भी OpenAI-संगत एंडपॉइंट) को एक ही डेस्कटॉप ऐप में एकीकृत करता है। सब कुछ स्थानीय रूप से संग्रहीत होता है — आपकी API कुंजियाँ और वार्तालाप आपके द्वारा विन्यस्त प्रदाताओं को छोड़कर कहीं और नहीं जाते।

## 📑 Table of Contents

- [✨ विशेषताएँ](#-विशेषताएँ)
  - [🖥️ चैट](#️-chat)
  - [🤖 एजेंट (function calling)](#-एजेंट-function-calling)
  - [🔒 गोपनीयता](#-privacy)
- [🚀 त्वरित आरंभ](#-त्वरित-आरंभ)
- [📁 परियोजना संरचना](#-परियोजना-संरचना)
- [🤝 आभार](#-आभार)
- [📄 लाइसेंस](#-लाइसेंस)

---

## ✨ विशेषताएँ

### 🖥️ चैट

- **मल्टी-प्रदाता एब्स्ट्रैक्शन** — एकल एडेप्टर परत; किसी प्रदाता प्रारूप को जोड़ना मात्र एक फ़ाइल का काम है। वर्तमान में OpenAI-संगत (OpenRouter, Together, DeepSeek, Ollama की OpenAI शिम, LM Studio, आदि को आच्छादित करता है)।
- **समवर्ती मल्टी-सत्र स्ट्रीमिंग** — एक चैट स्ट्रीम कर सकती है जबकि आप दूसरे में बातचीत जारी रखें।
- **Arena** — एक प्रॉम्प्ट, कई मॉडल एक साथ उत्तर देते हैं; सर्वश्रेष्ठ के लिए वोट करें और एक ELO लीडरबोर्ड स्वतः अद्यतन होता है।
- **पर्सोना** — सिस्टम-प्रॉम्प्ट प्रिसेट, प्रति-सत्र बदले जा सकते हैं।
- **अटैचमेंट** — पाठ फ़ाइलें संदर्भ के रूप में डाली जाती हैं; चित्र मल्टिमॉडल हो जाते हैं (एक विज़न मॉडल चाहिए)।
- **लंबे-पेस्ट संक्षिप्तीकरण** — सैकड़ों पंक्तियाँ पेस्ट करने पर स्वतः एक विस्तार-योग्य स्निपेट में सिमट जाती हैं (ChatGPT-शैली)।
- **थिंकिंग-प्रयास स्लाइडर** — वास्तविक पैरामीटर: OpenAI o-series → `reasoning_effort`, Claude → `thinking.budget_tokens`।
- **साइडबार सारांश** — शीर्षक मॉडल-निर्मित विषय वाक्यांश होते हैं (जैसे "नई Eiyuu Angel पुल सलाह"), न कि कॉपी किया गया पाठ।
- **उन्नत सेटिंग्स** — अधिकतम टोकन, तापमान, top_p, कस्टम सिस्टम प्रिफ़िक्स, प्रति-भाषा स्वतः-शीर्षक।
- **कस्टम पृष्ठभूमि** — अस्पष्टता / धुंधलापन नियंत्रण के साथ एक चित्र अपलोड करें।
- **15 UI भाषाएँ** — English (मानक + उल्टा), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어।
- **थीम** — Light / Dark / Blue / Glass / Retro।
- **स्थानीय भंडारण** — सभी डेटा एक स्थानीय SQLite डेटाबेस में; कुछ भी अपलोड नहीं होता।

### 🤖 एजेंट (function calling)

- **13 अंतर्निर्मित टूल** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) एक Plan→Act→Observe लूप और लाइव रीज़निंग ट्रेस के साथ।
- **एजेंट अनुमति मोड** — Off / Ask (प्रत्येक जोखिमपूर्ण टूल की पुष्टि करें) / Auto (सभी की अनुमति दें) / Plan (केवल-पठनीय)। यह एक कोडिंग एजेंट के अनुमति मॉडल को प्रतिबिंबित करता है।
- **MCP समर्थन** — बाहरी stdio MCP सर्वर जोड़ें; उनके टूल अंतर्निर्मित टूलों में स्वतः मिल जाते हैं।
- **Tool call repair** — LLMs कभी-कभी गलत JSON उत्पन्न करते हैं; एजेंट लूप निष्पादन से पहले गुम अर्ग्यूमेंट, बिना उद्धरण चाइल्ड और ट्रंकेटेड कॉल स्वतः ठीक करता है।

---

## 🚀 त्वरित आरंभ

### पूर्व-आवश्यकताएँ
- Node.js 18+
- npm 9+

### स्थापित करें और चलाएँ
```bash
cd app
npm install
npm run dev      # विकास (हॉट रीलोड)
npm run build    # उत्पादन फ्रंटएंड का निर्माण
npm start        # Electron लॉन्च करें
```

अथवा Windows पर रिपॉज़िटरी मूल पर `start.bat` चलाएँ।

### अपना पहला प्रदाता विन्यस्त करें
1. लॉन्च होने के बाद, साइडबार में **Models** पर क्लिक करें।
2. एक प्रदाता जोड़ें (नाम / API URL / API Key)।
3. उपलब्ध मॉडल सूची लाने के लिए **Fetch models** पर क्लिक करें।
4. चैट पर लौटें और बात करना आरंभ करें।

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

## 🗺️ ## 🤝 आभार

AetherAI इन परियोजनाओं के कंधों पर खड़ा है — इनके विचारों ने वास्तुकला और अनुभव को आकार दिया:

- [Claude Code](https://github.com/anthropics/claude-code) — एजेंट अनुमति मॉडल, थिंकिंग-प्रयास स्लाइडर, टूल-कॉल विज़ुअलाइज़ेशन, नई-चैट रिक्त स्थिति।
- [Continue](https://github.com/continuedev/continue) — घोषणात्मक कॉन्फ़िग-एक-सत्य-स्रोत, प्रदाता एब्स्ट्रैक्शन, फ़ंक्शन-कॉलिंग प्रोटोकॉल।
- [Dify](https://github.com/langgen/dify) — बहु-प्रारूप प्रदाता सामान्यीकरण पैटर्न।
- [Model Context Protocol](https://modelcontextprotocol.io) — वह MCP विनिर्देश जिसे AetherAI का एजेंट बोलता है।
- [shadcn/ui](https://github.com/shadcn-ui/ui) — cn() / cva कॉपी-पेस्ट घटक पद्धति।
- [Magic UI](https://github.com/magicuidesign/magicui) — एनिमेशन पैटर्न (स्ट्रीमिंग पाठ, शिमर, ब्लर-फ़ेड)।
- [new-api](https://github.com/QuantumNous/new-api) — रीज़निंग-प्रयास रिले रूपांतरण संदर्भ।
- [OpenClaw](https://github.com/openclaw/openclaw) — README पॉलिश + ऑनबोर्डिंग प्रेरणा।
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

---

## 📄 लाइसेंस

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
