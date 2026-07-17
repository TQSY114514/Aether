<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**एक स्थानीय-प्रथम, मल्टी-मॉडल डेस्कटॉप AI चैट क्लाइंट · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

> **स्थिति: बीटा।** AetherAI एक व्यक्तिगत/शौकिया परियोजना है। यह काम करता है, लेकिन खुरदरापन होगा। बग रिपोर्ट का स्वागत है — [CONTRIBUTING.md](./CONTRIBUTING.md) और [SECURITY.md](./SECURITY.md) देखें।


AetherAI कई LLM प्रदाताओं (OpenAI / Claude / DeepSeek / स्थानीय मॉडल / कोई भी OpenAI-संगत एंडपॉइंट) को एक ही डेस्कटॉप ऐप में एकीकृत करता है। सब कुछ स्थानीय रूप से संग्रहीत होता है — आपकी API कुंजियाँ और वार्तालाप आपके द्वारा विन्यस्त प्रदाताओं को छोड़कर कहीं और नहीं जाते।

## ✨ विशेषताएँ

- **मल्टी-प्रदाता एब्स्ट्रैक्शन** — एकल एडेप्टर परत; किसी प्रदाता प्रारूप को जोड़ना मात्र एक फ़ाइल का काम है। वर्तमान में OpenAI-संगत (OpenRouter, Together, DeepSeek, Ollama की OpenAI शिम, LM Studio, आदि को आच्छादित करता है)।
- **समवर्ती मल्टी-सत्र स्ट्रीमिंग** — एक चैट स्ट्रीम कर सकती है जबकि आप दूसरे में बातचीत जारी रखें।
- **Arena** — एक प्रॉम्प्ट, कई मॉडल एक साथ उत्तर देते हैं; सर्वश्रेष्ठ के लिए वोट करें और एक ELO लीडरबोर्ड स्वतः अद्यतन होता है।
- **पर्सोना** — सिस्टम-प्रॉम्प्ट प्रिसेट, प्रति-सत्र बदले जा सकते हैं।
- **अटैचमेंट** — पाठ फ़ाइलें संदर्भ के रूप में डाली जाती हैं; चित्र मल्टिमॉडल हो जाते हैं (एक विज़न मॉडल चाहिए)।
- **लंबे-पेस्ट संक्षिप्तीकरण** — सैकड़ों पंक्तियाँ पेस्ट करने पर स्वतः एक विस्तार-योग्य स्निपेट में सिमट जाती हैं (ChatGPT-शैली)।
- **एजेंट (फ़ंक्शन कॉलिंग)** — 13 अंतर्निर्मित टूल (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) एक Plan→Act→Observe लूप और लाइव रीज़निंग ट्रेस के साथ।
- **एजेंट अनुमति मोड** — Off / Ask (प्रत्येक जोखिमपूर्ण टूल की पुष्टि करें) / Auto (सभी की अनुमति दें) / Plan (केवल-पठनीय)। यह एक कोडिंग एजेंट के अनुमति मॉडल को प्रतिबिंबित करता है।
- **MCP समर्थन** — बाहरी stdio MCP सर्वर जोड़ें; उनके टूल अंतर्निर्मित टूलों में स्वतः मिल जाते हैं।
- **थिंकिंग-प्रयास स्लाइडर** — वास्तविक पैरामीटर: OpenAI o-series → `reasoning_effort`, Claude → `thinking.budget_tokens`।
- **साइडबार सारांश** — शीर्षक मॉडल-निर्मित विषय वाक्यांश होते हैं (जैसे "नई Eiyuu Angel पुल सलाह"), न कि कॉपी किया गया पाठ।
- **उन्नत सेटिंग्स** — अधिकतम टोकन, तापमान, top_p, कस्टम सिस्टम प्रिफ़िक्स, प्रति-भाषा स्वतः-शीर्षक।
- **कस्टम पृष्ठभूमि** — अस्पष्टता / धुंधलापन नियंत्रण के साथ एक चित्र अपलोड करें।
- **15 UI भाषाएँ** — English (मानक + उल्टा), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어।
- **थीम** — Light / Dark / Blue / Glass / Retro।
- **स्थानीय भंडारण** — सभी डेटा एक स्थानीय SQLite डेटाबेस में; कुछ भी अपलोड नहीं होता।

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

## 📁 परियोजना संरचना

```
app/
├── electron/              # मुख्य प्रक्रिया (Node)
│   ├── database.js        # SQLite (sql.js) डेटा परत
│   ├── ipc/               # IPC हैंडलर (chat / arena / session / mcp / ...)
│   ├── llm/               # LLM एब्स्ट्रैक्शन
│   │   ├── providerAdapter.js   # api_format द्वारा डिस्पैचर
│   │   ├── openaiAdapter.js     # OpenAI-संगत कार्यान्वयन
│   │   ├── reasoning.js         # थिंकिंग-प्रयास पैरामीटर बिल्डर
│   │   ├── │   │   ├── planning.js          │ # hierarchical task decomposition (DS4-inspired)
│   │   ├── toolLoop.js          │ # Plan→Act→Observe function-calling loop
│   │   ├── subAgent.js          │ # parallel sub-agent delegation
│   │   ├── autoMemory.js        │ # structured long-term memory (Hermes-inspired)
│   │   ├── reasoning.js         │ # thinking-effort param builder
│   │   └── toolArgs.js          │ # tool-arg parsing
│   ├── tools/             # अंतर्निर्मित टूल रजिस्ट्री
│   ├── mcp/               # MCP क्लाइंट + प्रबंधक
│   ├── main.js / preload.js
├── src/                   # रेंडरर (React + TS)
│   ├── store/index.ts     # zustand वैश्विक स्थिति
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 लोकेल) / थीम / मार्कडाउन
│   └── types/
└── package.json
```

## 🔒 गोपनीयता

**सभी डेटा स्थानीय रूप से संग्रहीत है।** AetherAI आपके बारे में कुछ भी एकत्र नहीं करता और कुछ भी अपलोड नहीं करता। आपकी API कुंजियाँ, वार्तालाप, और पर्सोना एक स्थानीय SQLite डेटाबेस में रहते हैं। एकमात्र बाहरगामी नेटवर्क अनुरोध आपके द्वारा विन्यस्त LLM प्रदाताओं के लिए होते हैं।

> ⚠️ GitHub पर पुश करने से पहले, सुनिश्चित करें कि `.gitignore` `*.db`, `dist/`, `node_modules/`, `background.img`, और किसी भी `.env` को बाहर रखता है।

## 🙏 आभार

AetherAI इन परियोजनाओं के कंधों पर खड़ा है — इनके विचारों ने वास्तुकला और अनुभव को आकार दिया:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — एजेंट अनुमति मॉडल, थिंकिंग-प्रयास स्लाइडर, टूल-कॉल विज़ुअलाइज़ेशन, नई-चैट रिक्त स्थिति।
- [Continue](https://github.com/continuedev/continue) — घोषणात्मक कॉन्फ़िग-एक-सत्य-स्रोत, प्रदाता एब्स्ट्रैक्शन, फ़ंक्शन-कॉलिंग प्रोटोकॉल।
- [Dify](https://github.com/langgen/dify) — बहु-प्रारूप प्रदाता सामान्यीकरण पैटर्न।
- [Model Context Protocol](https://modelcontextprotocol.io) — वह MCP विनिर्देश जिसे AetherAI का एजेंट बोलता है।
- [shadcn/ui](https://github.com/shadcn-ui/ui) — cn() / cva कॉपी-पेस्ट घटक पद्धति।
- [Magic UI](https://github.com/magicuidesign/magicui) — एनिमेशन पैटर्न (स्ट्रीमिंग पाठ, शिमर, ब्लर-फ़ेड)।
- [new-api](https://github.com/QuantumNous/new-api) — रीज़निंग-प्रयास रिले रूपांतरण संदर्भ।
- [OpenClaw](https://github.com/openclaw/openclaw) — README पॉलिश + ऑनबोर्डिंग प्रेरणा।
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

## 📄 लाइसेंस

MIT
