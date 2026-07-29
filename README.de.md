<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Eine local-first, multi-model Desktop-AI-Workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Status: Beta.** AetherAI ist ein Solo-/Hobbyprojekt. Es funktioniert, aber mit Ecken und Kanten. Fehlerberichte sind willkommen — siehe [CONTRIBUTING.md](./CONTRIBUTING.md) und [SECURITY.md](./SECURITY.md).

AetherAI vereint mehrere LLM-Anbieter — OpenAI / Claude / DeepSeek / lokale Modelle / jeden OpenAI-kompatiblen Endpunkt — in einer einzigen Desktop-Anwendung. Ein Agent, der Dateien liest/schreibt und Befehle ausführt, eine Workspace-Sandbox, eine Multi-Model-Arena mit ELO-Abstimmung, Skills und 15 UI-Sprachen. Alles lokal gespeichert: API-Schlüssel und Konversationen verlassen Ihren Rechner nie, außer zu den von Ihnen konfigurierten Anbietern.

---

## Was AetherAI besonders macht

AetherAI kombiniert mehrere Fähigkeiten, die normalerweise auf verschiedene Tools verteilt sind, in einer einzigen lokalen Desktop-Anwendung:

| Fähigkeit | Beschreibung | Reife |
|---|---|:---:|
| **Multi-Provider-Chat** | Wechseln Sie während einer Konversation zwischen OpenAI, Claude, DeepSeek und jedem OpenAI-kompatiblen Endpunkt. | `Stable` |
| **Agent-Tool-Loop** | 16 eingebaute Werkzeuge mit Plan-Act-Observe-Loop, Sandboxing, Erlaubnis-Leiter. | `Beta` |
| **Multi-Model-Arena** | Senden Sie einen Prompt an mehrere Modelle, stimmen Sie für die beste Antwort ab, verfolgen Sie ELO-Ranglisten. | `Beta` |
| **Skills & Erweiterbarkeit** | `SKILL.md`-Dateien zum Einfügen, MCP-Server, 10-Punkte-Hook-System. | `Experimental` |
| **Strukturiertes Gedächtnis** | Agent erinnert sich an Präferenzen und vergangene Entscheidungen über Sitzungen hinweg. | `Beta` |
| **Hierarchische Planung** | Komplexe Anfragen werden automatisch in parallele Unteraufgaben zerlegt. | `Experimental` |
| **Kontextkompression** | Lange Gespräche werden automatisch zusammengefasst, ohne Tool-Call-Paare zu verlieren. | `Beta` |
| **Local-First-Datenschutz** | Konversationen, Schlüssel, Personas in lokalem SQLite. Nichts verlässt Ihren Rechner. | `Stable` |
| **15 UI-Sprachen** | Einschließlich Klassisches Chinesisch (文言) und RTL Arabisch. | `Beta` |
| **MIT-lizenziert** | Vollständig Open Source. | `Stable` |

---

## Download

### Windows — Vorgefertigter Installer (Empfohlen für die meisten Nutzer)

Laden Sie die neueste [Release](https://github.com/TQSY114514/AetherAI/releases) herunter:

| Build | Beschreibung |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS-Installer. Pro-Benutzer (kein Admin), Auto-Updates in-App. **Empfohlen.** |
| **`AetherAI-x.y.z.exe`** | Portable Single-Exe. Keine Installation, keine Auto-Updates; einfach ausführen. |

> Der Installer zeigt beim ersten Start eine SmartScreen-Warnung „Unbekannter Publisher" — erwartet für eine unsignierte Solo-App. Alle Daten bleiben lokal.
>
> ⚠️ Manche Antiviren-Programme könnten die entpackte `electron.exe` während der Paketierung unter Quarantäne stellen, da die App nicht signiert ist. Wenn der Installer von Ihrer AV-Software entfernt wird, fügen Sie eine Ausnahme hinzu oder verwenden Sie den portablen Build.

### Aus dem Quellcode ausführen (Entwickler / Power-User)

Wenn Sie lieber aus dem Quellcode ausführen oder den Code modifizieren möchten, verwenden Sie `start.bat` (benötigt [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/AetherAI.git
cd AetherAI
start.bat        # Windows: installiert Abhängigkeiten, baut Frontend, startet Electron
```

Siehe [Schnellstart](#-quick-start) für die manuelle Schritt-für-Schritt-Anleitung.

> **exe vs start.bat** — beide werden unterstützt und richten sich an unterschiedliche Zielgruppen:
> - **Installer-Exe** — für Endbenutzer: Doppelklick zum Installieren, Start-Menü-Eintrag, Auto-Update in-App, kein Node.js benötigt.
> - **start.bat** — für Entwickler / Tüftler: transparente `npm install` → `vite build` → `electron .`-Pipeline, Edit-and-Run, benötigt Node.js.

---

## Schnellstart

**Voraussetzungen:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # Entwicklung (Hot Reload)
npm run build    # Produktions-Frontend
npm start        # Electron starten
```

Oder führen Sie auf Windows `start.bat` im Repository-Stammverzeichnis aus.

### Anbieter konfigurieren

1. Klicken Sie nach dem Start in der Seitenleiste auf **Models**.
2. Fügen Sie einen Anbieter hinzu (Name / API-URL / API-Schlüssel).
3. Klicken Sie auf **Fetch models**, um die verfügbare Modellliste abzurufen.
4. Kehren Sie zum Chat zurück und legen Sie los.

### Ask-Modus aktivieren

1. Öffnen Sie **Einstellungen - Agent & Sicherheit**.
2. Setzen Sie den Agent-Erlaubnismodus auf **Ask**.
3. Bestätigen Sie, dass der Workspace-Root der Ordner ist, in dem der Agent lesen/schreiben soll.
4. Lassen Sie **Yolo** deaktiviert, es sei denn, Sie wollen uneingeschränkten Zugriff.

### Erste Agent-Aufgabe ausführen

1. Öffnen Sie einen neuen Chat.
2. Fragen Sie: `Liste die Dateien in diesem Projekt und fasse zusammen, was die App macht.`
3. Überprüfen Sie jeden vorgeschlagenen Tool-Call. Genehmigen Sie sichere Leseoperationen; verweigern Sie alles Unvorhergesehene.
4. Überprüfen Sie den live Reasoning-Trace und die endgültige Antwort.

---

## Funktionen

**Status-Labels:** `Stable` = Daily-Use-fertig, `Beta` = nutzbar mit bekannten Ecken und Kanten, `Experimental` = neues/erweitertes Verhalten kann sich ändern, `Planned` = dokumentierter Roadmap-Punkt.

### Chat

| Funktion | Status | Beschreibung |
|---|:---:|---|
| **Multi-Provider** | `Stable` | Eine einzige Adapter-Schicht; ein neuer Provider = eine Datei. Deckt OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... ab. |
| **Gleichzeitiges Streaming** | `Stable` | Ein Chat streamt, während Sie in einem anderen weiterschreiben. |
| **Thinking-Effort-Schieber** | `Beta` | Echte Parameter: OpenAI o-Serie / gpt-5 / Claude über Relay. Nur wirksam bei Reasoning-Modellen. |
| **Anhänge** | `Beta` | Textdateien als Kontext; Bilder multimodal (benötigt Vision-Modell). |
| **Lange-Eingaben einklappen** | `Stable` | Hunderte Zeilen falten sich automatisch zu einem ausklappbaren Snippet (ChatGPT-Stil). |
| **Nachrichtenbearbeitung** | `Stable` | Überschreiben + Neuerstellen ab jedem Punkt. |
| **Nachrichtensuche** | `Stable` | Mit Hervorhebung über alle Nachrichten. |
| **Seitenleisten-Zusammenfassungen** | `Beta` | Modellgenerierte Themenphrasen, kein kopierter Text. |

### Agent (Function Calling)

- `Beta` **16 eingebaute Werkzeuge** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) mit einem Plan-Act-Observe-Loop, live Reasoning-Trace + Aufgabenliste, Loop-Erkennung, Tool-Timeouts, konfigurierbarem Iterationsbudget (Standard 25 Runden) und Kontextkompression.
- `Experimental` **Hierarchische Planung** — erzeugt automatisch Aufgabenzerlegung für komplexe Anfragen (DS4-inspiriert).
- `Experimental` **Sub-Agent-Delegation** — unabhängige Unteraufgaben laufen parallel via `delegate_task`.
- `Stable` **Erlaubnismodi** — risikoaufsteigende Leiter:

| Modus | Beschreibung | Sandbox |
|---|---|:---:|
| **Off** | Reiner Chat, keine Werkzeuge | N/A |
| **Plan** | Nur-Lese-Werkzeuge (untersuchen ohne Änderungen) | - |
| **Ask** | Jede riskante Aktion bestätigen (empfohlen) | - |
| **Auto** | Alles ausführen, keine Bestätigungen | Ja |
| **Yolo** | Vollständige Erlaubnis, keine Sandbox | Nein |

- `Stable` **Workspace-Sandbox** — `write_file`/`edit_file` werden außerhalb des konfigurierten Workspace-Roots abgelehnt; `run_command` blockiert destruktive Muster. Konfigurierbar in Einstellungen - Agent & Sicherheit.
- `Beta` **Kontextkompression** — fasst älteren Verlauf automatisch zusammen (Tool-Call/Ergebnis-Paare bleiben intakt; Identifikatoren unverändert).
- `Beta` **Tool-Call-Repair** — repariert automatisch fehlerhaftes JSON, fehlende Args, nicht zitierte Schlüssel und abgeschnittene Calls.

### Gedächtnis & Lernen

- `Beta` **Auto-Langzeitgedächtnis** — relevante Erinnerungen werden vor jedem Turn injiziert; Schlüsselfakten werden automatisch extrahiert und gespeichert. Umschaltbar in Einstellungen - Agent.
- `Experimental` **Gewohnheiten-Lerner** — erkennt wiederkehrende Präferenzen (z. B. „immer Claude verwenden") und schlägt automatisch angewendete Skills vor.
- `Beta` **Audit-Log** — Pro-Turn-Agent-Ausführungsverlauf zum Debuggen.

### Arena

- `Beta` **Multi-Model-Arena** — ein Prompt, mehrere Modelle antworten **gleichzeitig**; stimmen Sie für die beste Antwort und ein **ELO-Leaderboard** wird automatisch aktualisiert. Modelle werden **pro Intent** bewertet (Coding / Mathematik / Übersetzung / Zusammenfassung / Allgemein). *Keine andere Local-First-Desktop-Chat-App bietet eine eingebaute Multi-Model-Arena mit ELO.*

### Skills & Erweiterbarkeit

| Komponente | Format | Status | Details |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | Einfügen in `<workspace>/.claude/skills/`; ausgeliefert mit `release-checklist` und `git-commit` |
| **Slash Commands** | `CMD.md` | `Stable` | 6 eingebaut: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 Lebenszyklen-Punkte: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Externe MCP-Server verschmelzen automatisch mit eingebauten Werkzeugen |

### Anpassung

| Einstellung | Status | Beschreibung |
|---|:---:|---|
| **Erweiterte Modelleinstellungen** | `Stable` | Maximale Token, Temperatur, top_p, benutzerdefiniertes System-Präfix, pro-Sprache-Auto-Titel, Thinking-Effort |
| **Benutzerdefinierter Hintergrund** | `Stable` | Bild hochladen mit Transparenz-/Unschärfe-Reglern |
| **Personas** | `Stable` | System-Prompt-Vorlagen, pro Sitzung umschaltbar |
| **Themes** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 UI-Sprachen** | `Beta` | Englisch, Chinesisch (简/繁/文言), Japanisch, Spanisch, Französisch, Deutsch, Portugiesisch, Russisch, Ukrainisch, Arabisch (RTL), Hindi, Koreanisch |
| **Auto-Update** | `Beta` | NSIS-Installer prüft beim Start; Portable auch (manuelle Installation) |
| **Nutzungsverfolgung** | `Beta` | Pro-API-Call-Log mit Token, Kosten, Latenz, Cache-Hit-Rate |

### Datenschutz

> **Alle Daten bleiben lokal.** AetherAI sammelt nichts und lädt nichts von Ihnen hoch. Ihre API-Schlüssel, Konversationen und Personas leben in einer lokalen SQLite-Datenbank. Die einzigen ausgehenden Netzwerkverbindungen gehen zu den von Ihnen konfigurierten LLM-Anbietern.

---

## Projektstruktur

```
app/
├── electron/              # Main-Prozess (Node)
│   ├── database.js        # SQLite (sql.js) Datenschicht — 14 Tabellen
│   ├── ipc/               # IPC-Handler (chat / arena / session / mcp / ...)
│   │   ├── chat.handler.js    # DER zentrale Handler (540 Zeilen)
│   │   ├── arena.handler.js   # Multi-Model-Arena mit ELO
│   │   ├── agent.handler.js   # Workspace-Verwaltung
│   │   └── ...
│   ├── llm/               # LLM-Abstraktion (~3.700 Zeilen, 19 Dateien)
│   │   ├── providerAdapter.js # Dispatch nach api_format (openai/anthropic)
│   │   ├── openaiAdapter.js   # OpenAI-kompatibles SSE-Streaming + Retry
│   │   ├── anthropicAdapter.js# Anthropic Messages API
│   │   ├── credentialPool.js  # Multi-Key-Rotation + Cooldown
│   │   ├── toolLoop.js        # Plan-Act-Observe mit Iterationsbudget
│   │   ├── planning.js        # Hierarchische Aufgabenzerlegung
│   │   ├── subAgent.js        # Parallele Sub-Agent-Delegation
│   │   ├── compaction.js      # Kontextkompression (paar-erhaltend)
│   │   ├── autoMemory.js      # Langzeit-strukturiertes Gedächtnis
│   │   ├── habitLearner.js    # Wiederkehrende Präferenz -> Auto-Skills
│   │   ├── hooks.js           # 10-Punkte-Erweiterungs-Hooks
│   │   ├── skills.js          # SKILL.md-Loader (Claude Code Format)
│   │   ├── modelAdvisor.js    # Heuristische Modell-Empfehlung
│   │   ├── toolCallRepair.js  # Wiederherstellung fehlerhafter Tool-Calls
│   │   ├── auditLog.js        # Pro-Turn-Agent-Ausführungsverlauf
│   │   └── ...
│   ├── tools/             # Built-in-Tool-Registry + Sandbox
│   │   ├── registry.js       # 16 Tool-Definitionen (OpenClaw-inspiriert)
│   │   └── sandbox.js        # 3-Schicht-Defense (Workspace-Root, Traversal-Guard, Blocklist)
│   ├── mcp/               # MCP-Client + Server-Manager
│   ├── main.js / preload.js
├── src/                   # Renderer (React + TS + Zustand)
│   ├── store/index.ts     # Zustand globaler State (~1.000 Zeilen)
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 Locales) / Theme / Markdown
│   └── types/
├── skills/                # Built-in-Skills (release-checklist, git-commit)
├── commands/              # Built-in-Slash-Commands (/code, /explain, /polish, ...)
├── locales/               # Übersetzungsdateien (13 Sprachen, lazy-loaded)
└── resources/             # App-Icons
```

---

## Tech-Stack

| Schicht | Technologie |
|---|---|
| Desktop | Electron 31 |
| Frontend | React 18.3 + TypeScript 5.5 |
| State | Zustand 4.5 |
| Build | Vite 5.4 + electron-builder |
| Datenbank | sql.js (SQLite im Speicher, persistent auf Festplatte) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 Client |

---

## Danksagung

AetherAI steht auf den Schultern dieser Projekte — ihre Ideen haben die Architektur und UX geprägt:

### Agent-Frameworks

| Projekt | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent-Erlaubnismodell, Thinking-Slider, Tool-Call-Visualisierung, Sub-Agent-Delegation, Hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Kontextkompression, Tool-Call-Loop-Erkennung, Event-Stream-Architektur |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Iterationsbudget, strukturiertes Langzeitgedächtnis, autonome Skills |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, Kontextkompression, Tool-Call-Repair |
| [DS4](https://github.com/antirez/ds4) | Hierarchische Aufgabenzerlegung |

### UI & UX

| Projekt | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva Copy-Paste-Komponentenmethodik |
| [Magic UI](https://github.com/magicuidesign/magicui) | Animationsmuster (Shimmer, Blur-Fade) |

### Infrastruktur

| Projekt | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Multi-Format-Provider-Normalisierung |
| [MCP](https://modelcontextprotocol.io) | Das Protokoll, das AetherAIs Agent spricht |
| [cc-switch](https://github.com/farion1231/cc-switch) | Nutzungsstatistik-Dashboard-Layout |
| [new-api](https://github.com/QuantumNous/new-api) | Reasoning-Effort-Relay, Nutzungs-/Kostenverfolgung |
| [Continue](https://github.com/continuedev/continue) | Config-as-Source-of-Truth, Provider-Abstraktion |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Multi-Turn-Agent-Ausführung, sandboxed-Tool-Ausführung |
| [Aider](https://github.com/Aider-AI/aider) | LLM-Coding-Assistant-Tool-Loop, Git-Integration |
| [Cline](https://github.com/cline/cline) | IDE-embedded Agent, MCP-Integration, Erlaubnis-UX |

---

## Mitwirken

Alle Beiträge sind willkommen! Egal ob Bugfix, Feature-Wunsch, Übersetzungsverbesserung oder Dokumentation-Update — öffnen Sie ein Issue oder reichen Sie eine PR ein.

1. Forken Sie das Repository
2. Erstellen Sie einen Feature-Branch (`git checkout -b feat/mein-feature`)
3. Committen Sie Ihre Änderungen (`git commit -am 'Feature hinzufügen'`)
4. Pushen Sie zum Branch (`git push origin feat/mein-feature`)
5. Öffnen Sie eine Pull Request

Siehe [CONTRIBUTING.md](./CONTRIBUTING.md) für detaillierte Richtlinien.

---

## Lizenz

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Mit ❤️ gebaut mit Electron + React + TypeScript

[⬆ Zurück nach oben](#aetherai)

</div>
