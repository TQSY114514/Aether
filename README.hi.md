<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### किसी भी मॉडल से चैट करें, सुरक्षित कोडिंग एजेंट चलाएँ, और मॉडलों की आमने-सामने तुलना करें — सब कुछ आपकी मशीन पर

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **स्थिति: Beta.** AetherAI एक व्यक्तिगत/शौकिया परियोजना है। यह काम करता है, लेकिन खुरदरापन होगा। बग रिपोर्ट का स्वागत है — [CONTRIBUTING.md](./CONTRIBUTING.md) और [SECURITY.md](./SECURITY.md) देखें।

AetherAI कई LLM प्रदाताओं — OpenAI / Claude / DeepSeek / स्थानीय मॉडल / कोई भी OpenAI-संगत एंडपॉइंट — को एक ही डेस्कटॉप ऐप में एकीकृत करता है। चैट करें, कोडिंग एजेंट चलाएँ, और ELO मतदान के साथ मल्टी-मॉडल एरिना में मॉडलों की आमने-सामने तुलना करें।

**डिज़ाइन से स्थानीय-प्रथम।** API कुंजियाँ और बातचीत स्थानीय SQLite डेटाबेस में रहती हैं और आपकी मशीन से बाहर नहीं जातीं — सिवाय उन प्रदाताओं के जिन्हें आपने कॉन्फ़िगर किया है।

**डिफ़ॉल्ट से सुरक्षित।** अंतर्निर्मित एजेंट वर्कस्पेस सैंडबॉक्स के अंदर अनुमति सीढ़ी के साथ चलता है: फ़ाइल और कमांड तक पहुँच होने से पहले पुष्टि की जाती है, और हर टूल कॉल ऑडिट किया जा सकता है।

---

## AetherAI किस प्रकार भिन्न है

AetherAI कई क्षमताओं को एक ही स्थानीय डेस्कटॉप ऐप में जोड़ता है जो आमतौर पर कई उपकरणों में फैली होती हैं:

| क्षमता | विवरण | परिपक्वता |
|---|---|:---:|
| **Multi-provider Chat** | बातचीत के बीच में OpenAI, Claude, DeepSeek, और किसी भी OpenAI-संगत एंडपॉइंट के बीच स्विच करें। | `Stable` |
| **Agent Tool Loop** | Plan-Act-Observe लूप, सैंडबॉक्सिंग, अनुमति सीढ़ी के साथ 16 अंतर्निहित टूल। | `Beta` |
| **Multi-model Arena** | एक प्रॉम्प्ट को कई मॉडलों को भेजें, सर्वश्रेष्ठ पर मतदान करें, ELO रैंकिंग ट्रैक करें। | `Beta` |
| **Skills & Extensibility** | ड्रॉप-इन `SKILL.md` फ़ाइलें, MCP सर्वर, 10-पॉइंट हुक सिस्टम। | `Experimental` |
| **Structured Memory** | एजेंट सत्रों में प्राथमिकताओं और पिछले निर्णयों को याद रखता है। | `Beta` |
| **Hierarchical Planning** | जटिल अनुरोध स्वतः समानांतर उप-कार्यों में विघटित होते हैं। | `Experimental` |
| **Context Compaction** | लंबे वार्तालाप बिना टूल-कॉल जोड़े खोए स्वतः सारांशित होते हैं। | `Beta` |
| **Local-First Privacy** | वार्तालाप, कुंजियाँ, personas स्थानीय SQLite में। कुछ भी आपकी मशीन से बाहर नहीं जाता। | `Stable` |
| **15 UI Languages** | क्लासिकल चाइनीज़ (文言) और RTL अरबी सहित। | `Beta` |
| **MIT Licensed** | पूर्ण रूप से ओपन सोर्स। | `Stable` |

---

## डाउनलोड

### Windows — प्रीबिल्ट इंस्टॉलर (अधिकांश उपयोगकर्ताओं के लिए अनुशंसित)

नवीनतम [Release](https://github.com/TQSY114514/Aether/releases) डाउनलोड करें:

| Build | विवरण |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS इंस्टॉलर। प्रति-उपयोगकर्ता (कोई एडमिन नहीं), इन-ऐप ऑटो-अपडेट। **अनुशंसित।** |
| **`AetherAI-x.y.z.exe`** | पोर्टेबल सिंगल-exe। कोई इंस्टॉल नहीं, कोई ऑटो-अपडेट नहीं; बस चलाएँ। |

> इंस्टॉलर पहली लॉन्च पर SmartScreen "unknown publisher" चेतावनी दिखाता है — एक अहस्ताक्षरित व्यक्तिगत ऐप के लिए अपेक्षित। सभी डेटा स्थानीय रहता है।
>
> ⚠️ कुछ एंटीवायरस सॉफ़्टवेयर पैकेजिंग के दौरान अनपैक्ड `electron.exe` को क्वारंटाइन कर सकते हैं क्योंकि ऐप अहस्ताक्षरित है। यदि इंस्टॉलर आपके AV द्वारा हटा दिया जाता है, तो एक अपवाद जोड़ें या पोर्टेबल बिल्ड का उपयोग करें।

### स्रोत से चलाएँ (डेवलपर्स / पावर उपयोगकर्ता)

यदि आप स्रोत से चलाना पसंद करते हैं, या कोड संशोधित करना चाहते हैं, तो `start.bat` का उपयोग करें ([Node.js 18+](https://nodejs.org) आवश्यक):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

मैनुअल स्टेप-बाय-स्टेप के लिए [त्वरित आरंभ](#-quick-start) देखें।

> **exe vs start.bat** — दोनों समर्थित हैं और अलग-अलग दर्शकों की सेवा करते हैं:
> - **इंस्टॉलर exe** — अंत उपयोगकर्ताओं के लिए: इंस्टॉल करने के लिए डबल-क्लिक करें, Start Menu एंट्री, इन-ऐप ऑटो-अपडेट, Node.js की आवश्यकता नहीं।
> - **start.bat** — डेवलपर्स / टिंकरर्स के लिए: पारदर्शी `npm install` → `vite build` → `electron .` पाइपलाइन, edit-and-run, Node.js आवश्यक।

---

## त्वरित आरंभ

**पूर्वापेक्षाएँ:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

या Windows पर रिपो रूट पर `start.bat` चलाएँ।

### प्रदाता विन्यस्त करें

1. लॉन्च के बाद, साइडबार में **Models** पर क्लिक करें।
2. एक प्रदाता जोड़ें (name / API URL / API Key)।
3. उपलब्ध मॉडल सूची खींचने के लिए **Fetch models** पर क्लिक करें।
4. चैट पर वापस जाएँ और बात करना शुरू करें।

### Ask मोड सक्षम करें

1. **Settings - Agent & Safety** खोलें।
2. एजेंट अनुमति मोड को **Ask** पर सेट करें।
3. पुष्टि करें कि वर्कस्पेस रूट वह फ़ोल्डर है जिसे आप एजेंट को पढ़ना/लिखना चाहते हैं।
4. जब तक आप अप्रतिबंधित पहुँच नहीं चाहते, **Yolo** को अक्षम रखें।

### अपना पहला एजेंट कार्य चलाएँ

1. एक नई चैट खोलें।
2. पूछें: `List the files in this project and summarize what the app does.`
3. प्रत्येक प्रस्तावित टूल कॉल की समीक्षा करें। सुरक्षित रीड को मंज़ूरी दें; कुछ भी अप्रत्याशित अस्वीकार करें।
4. लाइव रीज़निंग ट्रेस और अंतिम उत्तर की जाँच करें।

---

## विशेषताएँ

**स्थिति लेबल:** `Stable` = दैनिक उपयोग के लिए तैयार, `Beta` = ज्ञात खुरदरापन के साथ उपयोग योग्य, `Experimental` = नया/उन्नत व्यवहार बदल सकता है, `Planned` = प्रलेखित रोडमैप आइटम।

### चैट

| विशेषता | स्थिति | विवरण |
|---|:---:|---|
| **Multi-provider** | `Stable` | एकल एडॉप्टर परत; प्रदाता जोड़ना = एक फ़ाइल। OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... कवर करता है। |
| **Concurrent streaming** | `Stable` | एक चैट स्ट्रीम करते समय आप दूसरे में बात करते रहते हैं। |
| **Thinking-effort slider** | `Beta` | वास्तविक पैरामीटर: OpenAI o-series / gpt-5 / Claude रिले के माध्यम से। केवल रीज़निंग मॉडलों पर प्रभावी। |
| **Attachments** | `Beta` | संदर्भ के रूप में टेक्स्ट फ़ाइलें; मल्टीमॉडल के लिए छवियाँ (विज़न मॉडल की आवश्यकता)। |
| **Long-paste collapse** | `Stable` | सैकड़ों लाइनें स्वतः एक विस्तार योग्य स्निपेट में संक्षिप्त होती हैं (ChatGPT-शैली)। |
| **Message editing** | `Stable` | किसी भी बिंदु से ओवरराइट + पुनः उत्पन्न करें। |
| **Message search** | `Stable` | सभी संदेशों में हाइलाइटिंग के साथ। |
| **Sidebar summaries** | `Beta` | मॉडल-जनित विषय वाक्यांश, कॉपी किए गए टेक्स्ट नहीं। |

### एजेंट (Function Calling)

- `Beta` **16 अंतर्निहित टूल** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) Plan-Act-Observe लूप, लाइव रीज़निंग ट्रेस + कार्य चेकलिस्ट, लूप पहचान, प्रति-टूल टाइमआउट, विन्यास योग्य पुनरावृत्ति बजट (डिफ़ॉल्ट 25 राउंड), और संदर्भ संपीड़न के साथ।
- `Experimental` **Hierarchical planning** — जटिल अनुरोधों के लिए स्वतः कार्य ब्रेकडाउन जनरेट करता है (DS4-प्रेरित)।
- `Experimental` **Sub-agent delegation** — स्वतंत्र उप-कार्य `delegate_task` के माध्यम से समानांतर चलते हैं।
- `Stable` **Permission modes** — जोखिम-आरोही सीढ़ी:

| Mode | विवरण | Sandbox |
|---|---|:---:|
| **Off** | सादी चैट, कोई टूल नहीं | N/A |
| **Plan** | केवल-पढ़ने वाले टूल (बिना परिवर्तन के जाँच) | - |
| **Ask** | प्रत्येक जोखिमपूर्ण क्रिया की पुष्टि करें (अनुशंसित) | - |
| **Auto** | सब कुछ चलाएँ, कोई पुष्टि नहीं | Yes |
| **Yolo** | पूर्ण अनुमति, कोई सैंडबॉक्स नहीं | No |

- `Stable` **Workspace sandbox** — `write_file`/`edit_file` विन्यस्त वर्कस्पेस रूट के बाहर अस्वीकार कर दिए जाते हैं; `run_command` विनाशकारी पैटर्न को ब्लॉक करता है। Settings - Agent & Safety में विन्यास योग्य।
- `Beta` **Context compaction** — पुराने इतिहास को स्वतः सारांशित करता है (टूल-कॉल/परिणाम जोड़े बरकरार; पहचानकर्ता शब्दशः संरक्षित)।
- `Beta` **Tool call repair** — विकृत JSON, गायब args, अनकोटेड keys, और कटे हुए कॉल को स्वतः मरम्मत करता है।

### Memory & Learning

- `Beta` **Auto long-term memory** — प्रत्येक टर्न से पहले प्रासंगिक यादें इंजेक्ट की जाती हैं; मुख्य तथ्य स्वतः निकाले और सहेजे जाते हैं। Settings - Agent में टॉगल करने योग्य।
- `Experimental` **Habit learner** — आवर्ती प्राथमिकताओं का पता लगाता है (जैसे "हमेशा Claude का उपयोग करें") और स्वतः-लागू skills प्रस्तावित करता है।
- `Beta` **Audit log** — डिबगिंग के लिए प्रति-टर्न एजेंट निष्पादन ट्रेस।

### Arena

- `Beta` **Multi-model arena** — एक प्रॉम्प्ट, कई मॉडल **समवर्ती** रूप से उत्तर देते हैं; सर्वश्रेष्ठ के लिए मतदान करें और एक **ELO लीडरबोर्ड** स्वतः अपडेट होता है। मॉडल **प्रति इरादे** स्कोर किए जाते हैं (कोडिंग / गणित / अनुवाद / सारांश / सामान्य)। *कोई अन्य स्थानीय-प्रथम डेस्कटॉप चैट ऐप ELO के साथ अंतर्निहित मल्टी-मॉडल एरिना नहीं देता है।*

### Skills & Extensibility

| घटक | प्रारूप | स्थिति | विवरण |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | `<workspace>/.claude/skills/` में ड्रॉप करें; `release-checklist` और `git-commit` के साथ आता है |
| **Slash Commands** | `CMD.md` | `Stable` | 6 अंतर्निहित: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 जीवनचक्र बिंदु: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | बाहरी MCP सर्वर स्वतः अंतर्निहित टूल के साथ मर्ज होते हैं |

### Customization

| सेटिंग | स्थिति | विवरण |
|---|:---:|---|
| **Advanced model settings** | `Stable` | Max tokens, temperature, top_p, custom system prefix, per-language auto-titles, thinking effort |
| **Custom background** | `Stable` | opacity / blur नियंत्रण के साथ छवि अपलोड करें |
| **Personas** | `Stable` | System-prompt presets, प्रति सत्र स्विच करने योग्य |
| **Themes** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 UI languages** | `Beta` | English, Chinese (简/繁/文言), Japanese, Spanish, French, German, Portuguese, Russian, Ukrainian, Arabic (RTL), Hindi, Korean |
| **Auto-update** | `Beta` | NSIS इंस्टॉलर लॉन्च पर जाँच करता है; पोर्टेबल भी जाँच करता है (मैनुअल इंस्टॉल) |
| **Usage tracking** | `Beta` | tokens, cost, latency, cache hit rate के साथ प्रति-API-कॉल लॉग |

### Privacy

> **सभी डेटा स्थानीय रहता है।** AetherAI आपके बारे में कुछ भी एकत्र नहीं करता और अपलोड नहीं करता। आपकी API कुंजियाँ, वार्तालाप, और personas एक स्थानीय SQLite डेटाबेस में रहते हैं। एकमात्र आउटबाउंड नेटवर्क अनुरोध आपके द्वारा विन्यस्त LLM प्रदाताओं को जाते हैं।

---

## परियोजना संरचना

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

## तकनीकी स्टैक

| परत | तकनीक |
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

## आभार

AetherAI इन परियोजनाओं के कंधों पर खड़ा है — इनके विचारों ने वास्तुकला और UX को आकार दिया:

### Agent frameworks

| Project | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | एजेंट अनुमति मॉडल, थिंकिंग स्लाइडर, टूल-कॉल विज़ुअलाइज़ेशन, सब-एजेंट प्रतिनिधिमंडल, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | संदर्भ संपीड़न, टूल-कॉल लूप पहचान, event-stream वास्तुकला |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | पुनरावृत्ति बजट, संरचित दीर्घकालिक मेमोरी, स्वायत्त skills |
| [OpenAI Codex](https://github.com/openai/codex) | सैंडबॉक्सिंग, संदर्भ संपीड़न, टूल-कॉल मरम्मत |
| [DS4](https://github.com/antirez/ds4) | पदानुक्रमित कार्य विघटन |

### UI & UX

| Project | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva कॉपी-पेस्ट घटक पद्धति |
| [Magic UI](https://github.com/magicuidesign/magicui) | एनिमेशन पैटर्न (shimmer, blur-fade) |

### Infrastructure

| Project | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | बहु-प्रारूप प्रदाता सामान्यीकरण |
| [MCP](https://modelcontextprotocol.io) | वह विनिर्देश जिसे AetherAI का एजेंट बोलता है |
| [cc-switch](https://github.com/farion1231/cc-switch) | उपयोग-आँकड़े डैशबोर्ड लेआउट |
| [new-api](https://github.com/QuantumNous/new-api) | रीज़निंग-प्रयास रिले, उपयोग/लागत ट्रैकिंग |
| [Continue](https://github.com/continuedev/continue) | Config-as-source-of-truth, प्रदाता एब्स्ट्रैक्शन |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | मल्टी-टर्न एजेंट निष्पादन, सैंडबॉक्स्ड टूल निष्पादन |
| [Aider](https://github.com/Aider-AI/aider) | LLM कोडिंग-सहायक टूल लूप, git एकीकरण |
| [Cline](https://github.com/cline/cline) | IDE-एम्बेडेड एजेंट, MCP एकीकरण, अनुमति UX |

---

## योगदान

सभी योगदान का स्वागत है! चाहे बग फिक्स हो, फीचर रिक्वेस्ट, अनुवाद सुधार, या दस्तावेज़ी अपडेट — कृपया issue खोलें या PR सबमिट करें।

1. रिपो को फॉक करें
2. फीचर ब्रांच बनाएं (`git checkout -b feat/my-feature`)
3. अपने परिवर्तन कॉमिट करें (`git commit -am 'Add feature'`)
4. ब्रांच पर पुश करें (`git push origin feat/my-feature`)
5. Pull Request खोलें

विस्तृत गाइडलाइन के लिए [CONTRIBUTING.md](./CONTRIBUTING.md) देखें।

---

## लाइसेंस

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ शीर्ष पर वापस](#aetherai)

</div>
