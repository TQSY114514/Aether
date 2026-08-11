<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Local-first · Multi-model · Agent-native

किसी भी मॉडल से चैट करें, एक सुरक्षित कोडिंग एजेंट चलाएँ, और मॉडलों की आमने-सामने तुलना करें — अपने डेस्कटॉप पर या अपने टर्मिनल में।

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 43](https://img.shields.io/badge/Electron-43-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>अनुवाद अंग्रेज़ी / सरलीकृत-चीनी संस्करण से पिछड़ सकते हैं।</sup>

</div>

---

> **स्थिति: Beta.** AetherAI एक व्यक्तिगत/शौकिया परियोजना है। यह काम करता है, लेकिन खुरदरे किनारों की उम्मीद करें।
> बग रिपोर्ट का स्वागत है — [CONTRIBUTING.md](./CONTRIBUTING.md) और
> [SECURITY.md](./SECURITY.md) देखें।

**प्लेटफ़ॉर्म: केवल Windows.** आधिकारिक बिल्ड, परीक्षण और सहायता Windows को लक्षित करती है। macOS / Linux स्रोत से बिल्ड हो सकते हैं लेकिन आधिकारिक रूप से समर्थित नहीं हैं, और कोड साइनिंग की योजना नहीं है — पहली लॉन्च पर SmartScreen "unknown publisher" प्रॉम्प्ट की उम्मीद करें ([Download](#download) देखें)।

**हर मॉडल के लिए एक ऐप।** OpenAI / Claude / DeepSeek / स्थानीय मॉडल / कोई भी OpenAI-संगत एंडपॉइंट — चैट करें, कोडिंग एजेंट चलाएँ, और ELO मतदान के साथ मल्टी-मॉडल एरिना में मॉडलों की आमने-सामने तुलना करें।

**डिज़ाइन से स्थानीय-प्रथम।** API कुंजियाँ और बातचीत एक स्थानीय SQLite डेटाबेस में रहती हैं और कभी आपकी मशीन से बाहर नहीं जातीं — सिवाय उन प्रदाताओं के जिन्हें आपने कॉन्फ़िगर किया है।

**डिफ़ॉल्ट से सुरक्षित।** अंतर्निर्मित एजेंट अनुमति सीढ़ी के साथ एक वर्कस्पेस सैंडबॉक्स के अंदर चलता है: फ़ाइल और कमांड तक पहुँच होने से पहले पुष्टि की जाती है, और हर टूल कॉल ऑडिट योग्य है।

---

## AetherAI किस प्रकार भिन्न है

AetherAI कई क्षमताओं को एक ही स्थानीय डेस्कटॉप ऐप में जोड़ता है जो आमतौर पर कई टूल में फैली होती हैं:

| क्षमता | विवरण | परिपक्वता |
|---|---|:---:|
| **Multi-provider Chat** | बातचीत के बीच में OpenAI, Claude, DeepSeek और किसी भी OpenAI-संगत एंडपॉइंट के बीच स्विच करें। | `Stable` |
| **Agent Tool Loop** | Plan-Act-Observe लूप, सैंडबॉक्सिंग, अनुमति सीढ़ी के साथ 42 अंतर्निहित टूल। | `Beta` |
| **Multi-model Arena** | एक प्रॉम्प्ट को कई मॉडलों को भेजें, सर्वश्रेष्ठ पर मतदान करें, ELO रैंकिंग ट्रैक करें। | `Beta` |
| **Skills & Extensibility** | ड्रॉप-इन `SKILL.md` फ़ाइलें, MCP सर्वर, 10-पॉइंट हुक सिस्टम। | `Experimental` |
| **Structured Memory** | एजेंट सत्रों में प्राथमिकताओं और पिछले निर्णयों को याद करता है। | `Beta` |
| **Hierarchical Planning** | जटिल अनुरोध स्वतः समानांतर उप-कार्यों में विघटित होते हैं। | `Experimental` |
| **Context Compaction** | लंबे वार्तालाप बिना टूल-कॉल जोड़े खोए स्वतः सारांशित होते हैं। | `Beta` |
| **Local-First Privacy** | वार्तालाप, कुंजियाँ, personas स्थानीय SQLite में। कुछ भी आपकी मशीन से बाहर नहीं जाता। | `Stable` |
| **15 UI Languages** | क्लासिकल चाइनीज़ (文言) और RTL अरबी सहित। | `Beta` |
| **Terminal TUI** | Ink v5 इंटरैक्टिव टर्मिनल: सत्र स्ट्रीम, टूल कार्ड, diff समीक्षा/रोलबैक, कीबोर्ड अनुमति द्वार, `/fork` सत्र ट्री, `/memory`, चलते-चलते steering इंजेक्शन। | `Beta` |
| **Headless CLI · RPC · SDK** | चार-मोड CLI (सिंगल-शॉट / NDJSON / JSONL RPC / पाइप), Electron-free SDK (`aetherai/sdk`), मशीन-कॉल करने योग्य JSONL प्रोटोकॉल। | `Beta` |
| **MIT Licensed** | पूर्ण रूप से ओपन सोर्स। | `Stable` |

---

## डाउनलोड

### Windows — प्रीबिल्ट इंस्टॉलर (अधिकांश उपयोगकर्ताओं के लिए अनुशंसित)

नवीनतम [Release](https://github.com/TQSY114514/Aether/releases) डाउनलोड करें:

| Build | विवरण |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS इंस्टॉलर। प्रति-उपयोगकर्ता (कोई एडमिन नहीं), इन-ऐप ऑटो-अपडेट। **अनुशंसित।** |
| **`AetherAI-x.y.z.exe`** | पोर्टेबल सिंगल-exe। कोई इंस्टॉल नहीं, कोई ऑटो-अपडेट नहीं; बस इसे चलाएँ। |

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

मैनुअल स्टेप-बाय-स्टेप के लिए [Quick Start](#-quick-start) देखें।

> **exe vs start.bat** — दोनों समर्थित हैं और अलग-अलग दर्शकों की सेवा करते हैं:
> - **इंस्टॉलर exe** — अंत उपयोगकर्ताओं के लिए: इंस्टॉल करने के लिए डबल-क्लिक करें, Start Menu एंट्री, इन-ऐप ऑटो-अपडेट, Node.js की आवश्यकता नहीं।
> - **start.bat** — डेवलपर्स / उत्सुक उपयोगकर्ताओं के लिए: पारदर्शी `npm install` → `vite build` → `electron .` पाइपलाइन, edit-and-run, Node.js आवश्यक।

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

### टर्मिनल आज़माएँ (कोई Electron विंडो आवश्यक नहीं)

```bash
cd app && npm install
node cli.js tui              # 交互终端 UI（Node ≥ 22；Windows Terminal 体验最佳）
node cli.js "你好"           # 单发 prompt
echo "总结一下" | node cli.js  # 管道 stdin 作为 prompt
node cli.js --mode json "x"  # NDJSON 事件流（脚本/CI）
node cli.js tui --smoke      # headless 状态机冒烟
```

### प्रदाता कॉन्फ़िगर करें

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

**स्थिति लेबल:** `Stable` = दैनिक उपयोग के लिए तैयार, `Beta` = ज्ञात खुरदरे किनारों के साथ उपयोग योग्य, `Experimental` = नया/उन्नत व्यवहार बदल सकता है, `Planned` = प्रलेखित रोडमैप आइटम।

### चैट

| विशेषता | स्थिति | विवरण |
|---|:---:|---|
| **Multi-provider** | `Stable` | एकल एडॉप्टर परत; प्रदाता जोड़ना = एक फ़ाइल। OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... कवर करता है। |
| **Concurrent streaming** | `Stable` | एक चैट स्ट्रीम होती है जबकि आप दूसरे में बात करते रहते हैं। |
| **Thinking-effort slider** | `Beta` | वास्तविक पैरामीटर: OpenAI o-series / gpt-5 / रिले के माध्यम से Claude। केवल रीज़निंग मॉडलों पर प्रभावी। |
| **Attachments** | `Beta` | संदर्भ के रूप में टेक्स्ट फ़ाइलें; मल्टीमॉडल के लिए छवियाँ (विज़न मॉडल की आवश्यकता)। |
| **Long-paste collapse** | `Stable` | सैकड़ों लाइनें स्वतः एक विस्तार योग्य स्निपेट में संक्षिप्त होती हैं (ChatGPT-शैली)। |
| **Message editing** | `Stable` | किसी भी बिंदु से ओवरराइट + पुनः उत्पन्न करें। |
| **Message search** | `Stable` | सभी संदेशों में हाइलाइटिंग के साथ। |
| **Sidebar summaries** | `Beta` | मॉडल-जनित विषय वाक्यांश, कॉपी किया गया टेक्स्ट नहीं। |

### एजेंट (Function Calling)

- `Beta` **42 अंतर्निहित टूल** — फ़ाइल संचालन (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), वेब (`web_search`, `web_fetch`), शेल (`run_command`), git और GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), कोड इंटेलिजेंस (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), एजेंट मेटा (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — Plan-Act-Observe लूप, लाइव रीज़निंग ट्रेस + कार्य चेकलिस्ट, लूप पहचान, प्रति-टूल टाइमआउट, विन्यास योग्य पुनरावृत्ति बजट (डिफ़ॉल्ट 25 राउंड), और संदर्भ संपीड़न के साथ।
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
- `Beta` **Tool call repair** — विकृत JSON, गायब args, अनकोटेड keys और कटे हुए कॉल को स्वतः मरम्मत करता है।

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

> **सभी डेटा स्थानीय रहता है।** AetherAI आपके बारे में कुछ भी एकत्र नहीं करता और कुछ भी अपलोड नहीं करता। आपकी API कुंजियाँ, वार्तालाप और personas एक स्थानीय SQLite डेटाबेस में रहते हैं। एकमात्र आउटबाउंड नेटवर्क अनुरोध उन LLM प्रदाताओं को जाते हैं जिन्हें आप कॉन्फ़िगर करते हैं।

---

## VS Code एक्सटेंशन और Headless CLI

डेस्कटॉप ऐप के अलावा, AetherAI समान एजेंट को CLI और एक एडिटर एक्सटेंशन के रूप में भेजता है:

- **Headless CLI** (`app/cli.js`) — एजेंट को गैर-इंटरैक्टिव रूप से चलाएँ, NDJSON इवेंट को स्क्रिप्ट/CI में फीड करें:
  ```bash
  node app/cli.js "fix the failing test" --workspace . --mode auto --max-iterations 30 --json-lines
  ```
- **VS Code एक्सटेंशन** (`extension/`) — चैट पैनल में CLI को स्पॉन करता है: लाइव टूल-कॉल स्ट्रीम, कोड-ब्लॉक एक्शन (Insert / Write file), और **file-diff कार्ड**: हर `write_file` / `edit_file` / `apply_patch` कॉल परिवर्तन-पूर्व फ़ाइल सामग्री के मुकाबले लाइन-स्तरीय diff रेंडर करता है, जिसमें एक-क्लिक **Revert** (टूल चलने से पहले लिया गया स्नैपशॉट पुनर्स्थापित करता है) होता है। एक्सटेंशन सेटिंग `aether.cliPath` आवश्यक है (जब रिपो स्थानीय रूप से क्लोन होती है तो स्वतः पहचाना जाता है)।
- **Local Gateway** (`127.0.0.1:35791`) — डेस्कटॉप ऐप द्वारा संचालित OpenAI-संगत REST API (Settings → Local Gateway → token); एक दूसरा एक्सटेंशन (`extensions/vscode-aether/`) इसके माध्यम से जुड़ता है।

---

## Terminal TUI, RPC और SDK

डेस्कटॉप ऐप और सादे CLI के अलावा, AetherAI एक इंटरैक्टिव टर्मिनल UI, एक मशीन-कॉल करने योग्य JSONL RPC मोड और एक Electron-free SDK भेजता है। तीनों डेस्कटॉप के समान एजेंट कोर, मेमोरी, personas, MCP टूल और अनुमति नियम साझा करते हैं।

### त्वरित आरंभ — दोहरा रूप

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

अतिरिक्त headless फ़्लैग: `--persona <id>` (persona + मेमोरी इंजेक्शन), `--memory-trace` (इंजेक्टेड मेमोरी एंट्रीज़ की संख्या रिपोर्ट करता है), `--skills` (स्किल प्रस्ताव JSON), `--setup-term` (Windows Terminal profile लिखता है), `--stdin` (स्पष्ट पाइप इनपुट)।

### TUI (`aether tui`)

इंटरैक्टिव टर्मिनल एजेंट (Ink v5; Node ≥ 22; Windows Terminal में सर्वोत्तम अनुभव):

- **सत्र**: संदेश स्ट्रीम रेंडरिंग, `/fork` सत्र ट्री (`session.parent_session_id`), `/sessions`, `/use <id>` इतिहास स्विचिंग
- **टूल और अनुमति**: टूल-कॉल कार्ड (स्थिति रंग/अवधि/सारांश), diff समीक्षा (`Alt+v` विस्तार, `Enter` स्वीकार / `r` रोलबैक — लिखने-पूर्व स्नैपशॉट पुनर्स्थापन, गैर-git निर्देशिकाओं में भी कार्य करता है), कीबोर्ड अनुमति द्वार (`y` एक बार अनुमति / `a` हमेशा अनुमति / `n` अस्वीकार, या `←→` चयन), केवल-पढ़ने वाले टूल स्वतः पास होते हैं
- **अनुमोदन मोड**: `Shift+Tab` `manual → auto-edits → plan` के बीच चक्रण (plan = केवल-पढ़ने वाली योजना, पूर्ण होने पर तीन विकल्प तय करते हैं कि कैसे लागू किया जाए)
- **मोड**: `Alt+m` ask/plan/auto के बीच स्विच; `/persona <id>` व्यक्तित्व स्विच (persona + मेमोरी प्रीफ़िक्स इंजेक्ट करता है)
- **leader शॉर्टकट**: `Ctrl+X` फिर `m` मॉडल चयनकर्ता / `n` नया सत्र / `l` सत्र सूची / `g` टाइमलाइन / `r` rewind चेकपॉइंट / `q` बाहर निकलें
- **कमांड पैलेट**: `Ctrl+P` या `x` (New chat / Model / Timeline / Export JSONL / Help / Quit)
- **पुनः बाध्य करने योग्य कुंजियाँ**: `~/.config/aether/keybindings.json` (जैसे `{ "char:?": null }` `?` सहायता कुंजी अक्षम करता है)
- **API key दृढ़ता**: `/apikey <provider> <key>` `auth.json` में सहेजता है (डेस्कटॉप संस्करण के safeStorage-एन्क्रिप्टेड keys को headless में डिक्रिप्ट नहीं किया जा सकता, इस कमांड या पर्यावरण चर `AETHER_API_KEY` का उपयोग करें)
- **मेमोरी और स्किल बंद-लूप**: `/memory <कीवर्ड>` पुनर्प्राप्ति, `--memory-trace` इंजेक्टेड एंट्रीज़ की संख्या, `/skills` + `/skill accept|dismiss <key>` (habitLearner → स्किल प्रस्ताव)
- **steering**: चलते समय `Ctrl+C` बाधित करें → अगली पंक्ति टाइप करें → वर्तमान लूप में इंजेक्ट करें (कतार `steer:n` दिखाती है); चलते समय `Tab` सीधे अगली पंक्ति कतारबद्ध करता है
- **शॉर्टकट**: `Esc` को डबल-प्रेस बाहर निकलता है (या `/quit`), `Esc` इनपुट साफ़ करता है (ड्राफ़्ट इतिहास में जाता है), `?` सहायता स्क्रीन, `PgUp/PgDn`/माउस व्हील पेजिंग, स्टेटस बार वास्तविक समय में `approval/mode/model/tok/ctx` दिखाता है; पूर्ण कुंजियाँ [docs/tui-keys.md](./docs/tui-keys.md) में देखें

### RPC (`aether --mode rpc`)

stdin/stdout पर मशीन-कॉल करने योग्य JSONL प्रोटोकॉल: `request` फ़्रेम अंदर, `event`/`result`/`error` फ़्रेम बाहर — प्रति पंक्ति एक JSON ऑब्जेक्ट, कोई मानव टेक्स्ट नहीं। विधियाँ: `run` (`text`/`tool`/`plan`/`status` इवेंट स्ट्रीम करता है), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`। फ़्रेम संदर्भ: [docs/rpc.md](./docs/rpc.md)।

### SDK (`require('aetherai/sdk')`)

बाहरी Node परियोजनाओं के लिए एजेंट कोर का Electron-free एकत्रीकरण: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, `rpc` फ़्रेम, `sessionContext` (persona + मेमोरी इंजेक्शन)। टाइप डिक्लेरेशन शामिल हैं (`app/electron/sdk/index.d.ts`)।

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Windows Native

| क्षमता | विवरण |
|---|---|
| **ट्रे मेनू** | विंडो दिखाएँ/छिपाएँ, नया सत्र, **नया कार्य** (सीधे TaskPanel खोलता है); ट्रे क्लिक दिखाने/छिपाने के बीच टॉगल करता है। |
| **ग्लोबल शॉर्टकट** | `Ctrl+Alt+A` मुख्य विंडो बुलाता है (शुरू न हो तो बनाता है); रजिस्ट्रेशन परिणाम स्टार्टअप लॉग में लिखा जाता है। |
| **`aetherai://` प्रोटोकॉल** | `aetherai://new` / `chat` नया सत्र; `aetherai://tui` टर्मिनल फ़ॉर्म सुझाता है; `aetherai://open/?path=<एन्कोडेड पथ>` फ़ोल्डर को वर्कस्पेस के रूप में सेट करता है और नया सत्र बनाता है (राइट-क्लिक "Aether के साथ खोलें" श्रृंखला)। |
| **राइट-क्लिक रजिस्ट्रेशन** | `app/resources/register-protocol.reg` (`<AETHER_EXE>` बदलने के बाद एडमिन के रूप में इम्पोर्ट करें): `.cs/.js/.ts/.tsx/.md/.json` + फ़ोल्डर → राइट-क्लिक "Aether के साथ खोलें"। |
| **टर्मिनल बूटस्ट्रैप** | `app/resources/term/aether.ps1` (एलियास + `aether tui` लॉन्च); `node app/cli.js --setup-term` Windows Terminal profile लिखता है (गहरा/हल्का दो रंग योजनाएँ)। |
| **सैंडबॉक्स सुदृढ़ीकरण** | Windows पथ रक्षा: `\\?\` लंबे पथ, UNC `\\server\share`, रिपार्स पॉइंट/junction भागने, `.lnk/.scr/.msi` जैसे खतरनाक एक्सटेंशन। |

---

## प्रोजेक्ट संरचना

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
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## तकनीकी स्टैक

| परत | तकनीक |
|---|---|
| Desktop | Electron 43 |
| Frontend | React 18.3 + TypeScript 5.8 |
| State | Zustand 4.5 |
| Build | Vite 8 + electron-builder |
| Database | better-sqlite3 (native SQLite, WAL mode) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |
| TUI | Ink 5 + React 18 (createElement, no JSX) |
| CLI/SDK | Node.js headless CLI (4 modes) + Electron-free SDK |

---

## आभार

AetherAI इन परियोजनाओं के कंधों पर खड़ा है — इनके विचारों ने वास्तुकला और UX को आकार दिया:

### एजेंट फ्रेमवर्क

| Project | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent permission model, thinking slider, tool-call visualization, sub-agent delegation, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Context compaction, tool-call loop detection, event-stream architecture |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Iteration budget, structured long-term memory, autonomous skills |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, context compression, tool-call repair |
| [DS4](https://github.com/antirez/ds4) | Hierarchical task decomposition |

### UI & UX

| Project | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva copy-paste component methodology |
| [Magic UI](https://github.com/magicuidesign/magicui) | Animation patterns (shimmer, blur-fade) |

### इंफ्रास्ट्रक्चर

| Project | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Multi-format provider normalization |
| [MCP](https://modelcontextprotocol.io) | The spec AetherAI's agent speaks |
| [cc-switch](https://github.com/farion1231/cc-switch) | Usage-stats dashboard layout |
| [new-api](https://github.com/QuantumNous/new-api) | Reasoning-effort relay, usage/cost tracking |
| [Continue](https://github.com/continuedev/continue) | Config-as-source-of-truth, provider abstraction |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Multi-turn agent execution, sandboxed tool execution |
| [Aider](https://github.com/Aider-AI/aider) | LLM coding-assistant tool loop, git integration |
| [Cline](https://github.com/cline/cline) | IDE-embedded agent, MCP integration, permission UX |

---

## योगदान

सभी योगदान का स्वागत है! चाहे बग फिक्स हो, फीचर अनुरोध, अनुवाद सुधार, या दस्तावेज़ अपडेट — कृपया एक issue खोलें या PR सबमिट करें।

1. रिपो को फॉक करें
2. एक फीचर ब्रांच बनाएँ (`git checkout -b feat/my-feature`)
3. अपने परिवर्तन कॉमिट करें (`git commit -am 'Add feature'`)
4. ब्रांच पर पुश करें (`git push origin feat/my-feature`)
5. एक Pull Request खोलें

विस्तृत गाइडलाइन के लिए [CONTRIBUTING.md](./CONTRIBUTING.md) देखें।

---

## लाइसेंस

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ शीर्ष पर वापस](#aetherai)

</div>
