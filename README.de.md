<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="Aether" />

# Aether

### Local-first · Multi-modell · Agent-nativ

Chatten Sie mit jedem Modell, führen Sie einen sicheren Coding-Agenten aus und vergleichen Sie Modelle Seite an Seite — auf Ihrem Desktop oder in Ihrem Terminal.

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 43](https://img.shields.io/badge/Electron-43-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo-/Hobby-Projekt` · `MIT-Lizenz`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>Übersetzungen können hinter der englischen / vereinfacht-chinesischen Version zurückbleiben.</sup>

</div>

---

> **Status: Beta.** Aether ist ein Solo-/Hobby-Projekt. Es funktioniert, aber
> rechnen Sie mit rauen Kanten. Bugmeldungen sind willkommen — siehe
> [CONTRIBUTING.md](./CONTRIBUTING.md) und [SECURITY.md](./SECURITY.md).

**Plattform: nur Windows.** Offizielle Builds, Tests und Support zielen auf Windows. macOS / Linux lassen sich eventuell aus dem Quellcode bauen, werden aber nicht offiziell unterstützt, und Codesignierung ist nicht geplant — rechnen Sie beim ersten Start mit einer SmartScreen-Meldung „Unbekannter Herausgeber" (siehe [Download](#download)).

**Eine App für jedes Modell.** OpenAI / Claude / DeepSeek / lokale Modelle / jeder OpenAI-kompatible Endpunkt — chatten, einen Coding-Agenten ausführen und Modelle in einer Multi-Modell-Arena mit ELO-Abstimmung direkt gegeneinander vergleichen.

**Local-first by design.** API-Schlüssel und Unterhaltungen liegen in einer lokalen SQLite-Datenbank und verlassen Ihren Rechner nie — außer zu den von Ihnen konfigurierten Anbietern.

**Standardmäßig sicher.** Der integrierte Agent läuft in einer Workspace-Sandbox mit einer Berechtigungsleiter: Datei- und Befehlszugriffe werden bestätigt, bevor sie stattfinden, und jeder Tool-Aufruf ist prüfbar.

---

## Was Aether anders macht

Aether bündelt mehrere Fähigkeiten, die normalerweise über verschiedene Tools verteilt sind, in einer lokalen Desktop-App:

| Fähigkeit | Beschreibung | Reifegrad |
|---|---|:---:|
| **Multi-Provider-Chat** | Mitten in der Unterhaltung zwischen OpenAI, Claude, DeepSeek und jedem OpenAI-kompatiblen Endpunkt wechseln. | `Stable` |
| **Agent-Tool-Loop** | 42 integrierte Tools mit Plan-Act-Observe-Loop, Sandboxing, Berechtigungsleiter. | `Beta` |
| **Multi-Modell-Arena** | Einen Prompt an mehrere Modelle senden, über das beste abstimmen, ELO-Ranglisten verfolgen. | `Beta` |
| **Skills & Erweiterbarkeit** | Drop-in-`SKILL.md`-Dateien, MCP-Server, 10-Punkte-Hook-System. | `Experimental` |
| **Strukturierter Speicher** | Der Agent ruft Präferenzen und frühere Entscheidungen über Sitzungen hinweg ab. | `Beta` |
| **Hierarchische Planung** | Komplexe Anfragen werden automatisch in parallele Unteraufgaben zerlegt. | `Experimental` |
| **Kontext-Kompaktierung** | Lange Unterhaltungen werden automatisch zusammengefasst, ohne Tool-Call-Paare zu verlieren. | `Beta` |
| **Local-First-Datenschutz** | Unterhaltungen, Schlüssel, Personas in lokaler SQLite. Nichts verlässt Ihren Rechner. | `Stable` |
| **15 UI-Sprachen** | Einschließlich klassischem Chinesisch (klassisches Chinesisch) und RTL-Arabisch. | `Beta` |
| **Terminal-TUI** | Ink-v5-Interaktivterminal: Sitzungsstream, Tool-Karten, Diff-Review/Rollback, Tastatur-Berechtigungsgate, `/fork`-Sitzungsbaum, `/memory`, Live-Steering-Einspeisung. | `Beta` |
| **Headless-CLI · RPC · SDK** | Vier-Modus-CLI (Einzelausführung / NDJSON / JSONL-RPC / Pipe), Electron-freies SDK (`aetherai/sdk`), maschinenaufrufbares JSONL-Protokoll. | `Beta` |
| **MIT-Lizenz** | Vollständig Open Source. | `Stable` |

---

## Download

### Windows — Vorgefertigtes Installationsprogramm (für die meisten Benutzer empfohlen)

Laden Sie die neueste [Release](https://github.com/TQSY114514/Aether/releases) herunter:

| Build | Beschreibung |
|---|---|
| **`aetherai-setup-x.y.z.exe`** | NSIS-Installer. Pro Benutzer (ohne Admin), In-App-Auto-Updates. **Empfohlen.** |
| **`aetherai-x.y.z.exe`** | Portables Einzel-EXE. Keine Installation, kein Auto-Update; einfach ausführen. |

> Der Installer zeigt beim ersten Start eine SmartScreen-Warnung „Unbekannter Herausgeber" — zu erwarten für eine unsignierte Solo-App. Alle Daten bleiben lokal.
>
> ⚠️ Einige Antivirenprogramme könnten die entpackte `electron.exe` beim Paketieren unter Quarantäne stellen, weil die App unsigniert ist. Wird der Installer von Ihrem AV entfernt, fügen Sie eine Ausnahme hinzu oder verwenden Sie den portablen Build.

### Aus dem Quellcode ausführen (Entwickler / Power-User)

Wenn Sie lieber aus dem Quellcode ausführen oder den Code ändern möchten, verwenden Sie `start.bat` (erfordert [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

Siehe [Schnellstart](#-quick-start) für die manuelle Schritt-für-Schritt-Anleitung.

> **exe vs. start.bat** — beides wird unterstützt und spricht verschiedene Zielgruppen an:
> - **Installer-exe** — für Endbenutzer: Doppelklick zum Installieren, Startmenü-Eintrag, In-App-Auto-Update, kein Node.js nötig.
> - **start.bat** — für Entwickler / Tüftler: transparente `npm install` → `vite build` → `electron .`-Pipeline, Bearbeiten-und-Ausführen, erfordert Node.js.

---

## Schnellstart

**Voraussetzungen:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

Oder führen Sie `start.bat` im Repository-Stammverzeichnis auf Windows aus.

### Terminal ausprobieren (kein Electron-Fenster nötig)

```bash
cd app && npm install
node cli.js tui              # interaktive Terminal-UI (Node ≥ 22; am besten in Windows Terminal)
node cli.js "hallo"           # Einmal-Prompt
echo "fasse zusammen" | node cli.js  # stdin per Pipe als Prompt
node cli.js --mode json "x"  # NDJSON-Ereignisstrom (Skripte/CI)
node cli.js tui --smoke      # Headless-Zustandsmaschinen-Smoke-Test
```

### Anbieter konfigurieren

1. Klicken Sie nach dem Start in der Seitenleiste auf **Models**.
2. Fügen Sie einen Anbieter hinzu (Name / API-URL / API-Key).
3. Klicken Sie auf **Fetch models**, um die verfügbare Modellliste zu laden.
4. Gehen Sie zurück zum Chat und beginnen Sie zu sprechen.

### Ask-Modus aktivieren

1. Öffnen Sie **Einstellungen - Agent & Sicherheit**.
2. Setzen Sie den Agent-Berechtigungsmodus auf **Ask**.
3. Stellen Sie sicher, dass das Workspace-Stammverzeichnis der Ordner ist, den der Agent lesen/beschreiben soll.
4. Lassen Sie **Yolo** deaktiviert, außer Sie möchten uneingeschränkten Zugriff.

### Ihre erste Agent-Aufgabe ausführen

1. Öffnen Sie einen neuen Chat.
2. Fragen Sie: `List the files in this project and summarize what the app does.`
3. Prüfen Sie jeden vorgeschlagenen Tool-Aufruf. Genehmigen Sie sichere Lesezugriffe; lehnen Sie alles Unerwartete ab.
4. Prüfen Sie die Live-Reasoning-Trace und die endgültige Antwort.

---

## Funktionen

**Statusbezeichnungen:** `Stable` = bereit für den täglichen Gebrauch, `Beta` = nutzbar mit bekannten rauen Kanten, `Experimental` = neues/fortgeschrittenes Verhalten kann sich ändern, `Planned` = dokumentierter Roadmap-Punkt.

### Chat

| Funktion | Status | Beschreibung |
|---|:---:|---|
| **Multi-Provider** | `Stable` | Einheitliche Adapter-Ebene; einen Anbieter hinzufügen = eine Datei. Umfasst OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Paralleles Streaming** | `Stable` | Ein Chat streamt, während Sie in einem anderen weiter schreiben. |
| **Thinking-Effort-Regler** | `Beta` | Echte Parameter: OpenAI-o-Serie / gpt-5 / Claude per Relay. Wirkt nur bei Reasoning-Modellen. |
| **Anhänge** | `Beta` | Textdateien als Kontext; Bilder für multimodal (benötigt ein Vision-Modell). |
| **Kollaps bei langen Einfügungen** | `Stable` | Hunderte Zeilen werden automatisch zu einem aufklappbaren Ausschnitt zusammengefaltet (ChatGPT-Stil). |
| **Nachrichten bearbeiten** | `Stable` | Überschreiben + Neu generieren an jedem Punkt. |
| **Nachrichtensuche** | `Stable` | Mit Hervorhebung über alle Nachrichten hinweg. |
| **Seitenleisten-Zusammenfassungen** | `Beta` | Modellgenerierte Themenphrasen, kein kopierter Text. |

### Agent (Function Calling)

- `Beta` **42 integrierte Tools** — Dateioperationen (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), Web (`web_search`, `web_fetch`), Shell (`run_command`), git & GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), Code-Intelligenz (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), Agent-Meta (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — mit Plan-Act-Observe-Loop, Live-Reasoning-Trace + Aufgaben-Checkliste, Loop-Erkennung, Timeouts pro Tool, konfigurierbarem Iterationsbudget (standardmäßig 25 Runden) und Kontext-Kompaktierung.
- `Experimental` **Hierarchische Planung** — generiert automatisch Aufgabenaufschlüsselungen für komplexe Anfragen (von DS4 inspiriert).
- `Experimental` **Sub-Agent-Delegation** — unabhängige Unteraufgaben laufen parallel über `delegate_task`.
- `Stable` **Berechtigungsmodi** — aufsteigende Risikoleiter:

| Modus | Beschreibung | Sandbox |
|---|---|:---:|
| **Off** | Normaler Chat, keine Tools | N/A |
| **Plan** | Nur-Lese-Tools (Untersuchen ohne Änderungen) | - |
| **Ask** | Jede riskante Aktion bestätigen (empfohlen) | - |
| **Auto** | Alles ausführen, keine Bestätigungen | Ja |
| **Yolo** | Volle Berechtigung, keine Sandbox | Nein |

- `Stable` **Workspace-Sandbox** — `write_file`/`edit_file` werden außerhalb des konfigurierten Workspace-Stammverzeichnisses verweigert; `run_command` blockiert destruktive Muster. Konfigurierbar unter Einstellungen - Agent & Sicherheit.
- `Beta` **Kontext-Kompaktierung** — fasst ältere Historie automatisch zusammen (Tool-Call/Ergebnis-Paare bleiben intakt; Bezeichner bleiben wörtlich erhalten).
- `Beta` **Tool-Call-Reparatur** — repariert automatisch fehlerhaftes JSON, fehlende Argumente, nicht zitierte Schlüssel und abgeschnittene Aufrufe.

### Speicher & Lernen

- `Beta` **Automatischer Langzeitspeicher** — relevante Erinnerungen werden vor jedem Schritt eingespritzt; Schlüsselfakten werden automatisch extrahiert und gespeichert. Umschaltbar unter Einstellungen - Agent.
- `Experimental` **Gewohnheits-Lerner** — erkennt wiederkehrende Präferenzen (z. B. „immer Claude verwenden") und schlägt automatisch angewandte Skills vor.
- `Beta` **Audit-Protokoll** — Agent-Ausführungsspur pro Schritt zum Debuggen.

### Arena

- `Beta` **Multi-Modell-Arena** — ein Prompt, mehrere Modelle antworten **gleichzeitig**; stimmen Sie für das beste ab, und eine **ELO-Rangliste** aktualisiert sich automatisch. Modelle werden **pro Absicht** bewertet (Coding / Mathe / Übersetzung / Zusammenfassung / Allgemein). *Keine andere lokale Desktop-Chat-App bringt eine integrierte Multi-Modell-Arena mit ELO mit.*

### Skills & Erweiterbarkeit

| Komponente | Format | Status | Details |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | In `<workspace>/.claude/skills/` einlegen; enthält `release-checklist` und `git-commit` |
| **Slash-Commands** | `CMD.md` | `Stable` | 6 integrierte: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Skript | `Experimental` | 10 Lebenszyklus-Punkte: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Externe MCP-Server werden automatisch mit integrierten Tools zusammengeführt |

### Anpassung

| Einstellung | Status | Beschreibung |
|---|:---:|---|
| **Erweiterte Modelleinstellungen** | `Stable` | Max-Tokens, Temperatur, top_p, benutzerdefiniertes System-Präfix, sprachabhängige Auto-Titel, Thinking-Effort |
| **Benutzerdefinierter Hintergrund** | `Stable` | Bild mit Deckkraft-/Unschärfe-Reglern hochladen |
| **Personas** | `Stable` | System-Prompt-Voreinstellungen, pro Sitzung umschaltbar |
| **Themes** | `Stable` | Hell / Dunkel / Blau / Glas / Retro |
| **15 UI-Sprachen** | `Beta` | Englisch, Chinesisch (Vereinfacht / Traditionell / Klassisch), Japanisch, Spanisch, Französisch, Deutsch, Portugiesisch, Russisch, Ukrainisch, Arabisch (RTL), Hindi, Koreanisch |
| **Auto-Update** | `Beta` | Der NSIS-Installer prüft beim Start; der portable Build ebenfalls (manuelle Installation) |
| **Nutzungsverfolgung** | `Beta` | Protokoll pro API-Aufruf mit Tokens, Kosten, Latenz, Cache-Trefferquote |

### Datenschutz

> **Alle Daten bleiben lokal.** Aether sammelt nichts über Sie und lädt nichts über Sie hoch. Ihre API-Schlüssel, Unterhaltungen und Personas liegen in einer lokalen SQLite-Datenbank. Die einzigen ausgehenden Netzwerkanfragen gehen an die von Ihnen konfigurierten LLM-Anbieter.

---

## VS-Code-Erweiterung & Headless-CLI

Über die Desktop-App hinaus liefert Aether denselben Agenten als CLI und Editor-Erweiterung:

- **Headless-CLI** (`app/cli.js`) — den Agenten nicht-interaktiv ausführen, NDJSON-Ereignisse an Skripte/CI füttern:
  ```bash
  node app/cli.js "fix the failing test" --workspace . --mode auto --max-iterations 30 --json-lines
  ```
- **VS-Code-Erweiterung** (`extension/`) — startet die CLI in einem Chat-Panel: Live-Tool-Call-Stream, Codeblock-Aktionen (Einfügen / Datei schreiben) und **Datei-Diff-Karten**: jeder `write_file`-/`edit_file`-/`apply_patch`-Aufruf rendert einen zeilengenauen Diff gegen den Dateiinhalt vor der Änderung, mit Ein-Klick-**Revert** (stellt den vor der Tool-Ausführung aufgenommenen Snapshot wieder her). Erfordert die Erweiterungseinstellung `aether.cliPath` (wird automatisch erkannt, wenn das Repo lokal geklont ist).
- **Lokales Gateway** (`127.0.0.1:35791`) — OpenAI-kompatible REST-API, gestützt von der Desktop-App (Einstellungen → Lokales Gateway → Token); eine zweite Erweiterung (`extensions/vscode-aether/`) verbindet sich darüber.

---

## Terminal-TUI, RPC & SDK

Über die Desktop-App und die einfache CLI hinaus liefert Aether eine interaktive Terminal-UI, einen maschinenaufrufbaren JSONL-RPC-Modus und ein Electron-freies SDK. Alle drei teilen sich denselben Agent-Kern, Speicher, Personas, MCP-Tools und Berechtigungsregeln wie die Desktop-App.

### Schnellstart — zwei Varianten

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

Zusätzliche Headless-Flags: `--persona <id>` (Persona + Memory-Injektion), `--memory-trace` (Anzahl der injizierten Memory-Einträge melden), `--skills` (Skill-Vorschläge als JSON), `--setup-term` (Windows-Terminal-Profil schreiben), `--stdin` (explizite Pipe-Eingabe).

### TUI (`aether tui`)

Interaktiver Terminal-Agent (Ink v5; Node ≥ 22; am besten in Windows Terminal zu erleben):

- **Sitzungen**: Streaming-Nachrichtenwiedergabe, `/fork`-Sitzungsbaum (`session.parent_session_id`), `/sessions`, `/use <id>` Verlauf wechseln
- **Tools & Berechtigungen**: Tool-Aufrufkarten (Statusfarbe/Dauer/Zusammenfassung), Diff-Review (`Alt+v` aufklappen, `Enter` akzeptieren / `r` zurücksetzen — Snapshot-Wiederherstellung vor dem Schreiben, funktioniert auch in Nicht-git-Verzeichnissen), Tastatur-Berechtigungsgate (`y` einmal erlauben / `a` immer erlauben / `n` ablehnen, oder mit `←→` auswählen), Read-only-Tools werden automatisch durchgelassen
- **Genehmigungsmodi**: `Shift+Tab` wechselt `manual → auto-edits → plan` (plan = Nur-Lese-Planung; nach Abschluss entscheiden drei Optionen, wie umgesetzt wird)
- **Modi**: `Alt+m` wechselt ask/plan/auto; `/persona <id>` wechselt die Persona (injiziert Persona + Memory-Präfix)
- **Leader-Shortcuts**: `Ctrl+X` dann `m` Modellauswahl / `n` neue Sitzung / `l` Sitzungsliste / `g` Zeitachse / `r` Rewind-Checkpoint / `q` beenden
- **Befehlspalette**: `Ctrl+P` oder `x` (New chat / Model / Timeline / Export JSONL / Help / Quit)
- **Tasten neu belegbar**: `~/.config/aether/keybindings.json` (z. B. `{ "char:?": null }` deaktiviert die `?`-Hilfetaste)
- **API-Key-Persistenz**: `/apikey <provider> <key>` speichert in `auth.json` (mit safeStorage verschlüsselte Keys der Desktop-Version können headless nicht entschlüsselt werden; verwenden Sie diesen Befehl oder die Umgebungsvariable `AETHER_API_KEY`)
- **Memory-Skill-Schleife**: `/memory <Schlüsselwort>` suchen, `--memory-trace` Anzahl der injizierten Einträge, `/skills` + `/skill accept|dismiss <key>` (habitLearner → Skill-Vorschläge)
- **Steering**: während des Laufs mit `Ctrl+C` unterbrechen → nächste Eingabe tippen → in den aktuellen Loop einspeisen (Warteschlange zeigt `steer:n`); während des Laufs mit `Tab` direkt die nächste Eingabe einreihen
- **Tastenkürzel**: Doppel-`Esc` beendet (oder `/quit`), `Esc` leert die Eingabe (Entwurf geht in den Verlauf), `?` Hilfebildschirm, `PgUp/PgDn`/Mausrad blättern, Statusleiste zeigt live `approval/mode/model/tok/ctx`; vollständige Tastenliste siehe [docs/tui-keys.md](./docs/tui-keys.md)

### RPC (`aether --mode rpc`)

Maschinenaufrufbares JSONL-Protokoll über stdin/stdout: `request`-Frames rein, `event`/`result`/`error`-Frames raus — ein JSON-Objekt pro Zeile, kein menschlicher Text. Methoden: `run` (streamt `text`/`tool`/`plan`/`status`-Ereignisse), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. Frame-Referenz: [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

Electron-freie Aggregation des Agent-Kerns für externe Node-Projekte: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, `rpc`-Frames, `sessionContext` (Persona + Memory-Injektion). Typdeklarationen enthalten (`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Windows-Nativ

| Fähigkeit | Beschreibung |
|---|---|
| **Tray-Menü** | Fenster anzeigen/ausblenden, neue Sitzung, **neue Aufgabe** (öffnet direkt das TaskPanel); Klick auf das Tray-Icon blendet ein/aus. |
| **Globaler Hotkey** | `Ctrl+Alt+A` ruft das Hauptfenster auf (wird erstellt, falls nicht gestartet); das Registrierungsergebnis wird in das Startprotokoll geschrieben. |
| **`aetherai://`-Protokoll** | `aetherai://new` / `chat` erstellt eine neue Sitzung; `aetherai://tui` öffnet die Terminal-Variante; `aetherai://open/?path=<codierter Pfad>` setzt den Ordner als Arbeitsbereich und erstellt eine neue Sitzung (Rechtsklick-„Mit Aether öffnen"-Kette). |
| **Rechtsklick-Registrierung** | `app/resources/register-protocol.reg` (nach Ersetzen von `<AETHER_EXE>` als Administrator importieren): `.cs/.js/.ts/.tsx/.md/.json` + Ordner → Rechtsklick „Mit Aether öffnen". |
| **Terminal-Bootstrap** | `app/resources/term/aether.ps1` (Alias + startet `aether tui`); `node app/cli.js --setup-term` schreibt ein Windows-Terminal-Profil (dunkles/helles Farbschema). |
| **Sandbox-Härtung** | Windows-Pfadabwehr: `\\?\`-Langpfade, UNC `\\server\share`, Reparse-Point/Junction-Escape, gefährliche Erweiterungen wie `.lnk/.scr/.msi`. |

---

## Projektstruktur

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

## Technologie-Stack

| Ebene | Technologie |
|---|---|
| Desktop | Electron 43 |
| Frontend | React 18.3 + TypeScript 5.8 |
| State | Zustand 4.5 |
| Build | Vite 8 + electron-builder |
| Datenbank | better-sqlite3 (natives SQLite, WAL-Modus) |
| LLM | OpenAI-kompatibel + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Benutzerdefinierter stdio JSON-RPC 2.0-Client |
| TUI | Ink 5 + React 18 (createElement, kein JSX) |
| CLI/SDK | Node.js-Headless-CLI (4 Modi) + Electron-freies SDK |

---

## Danksagungen

Aether steht auf den Schultern dieser Projekte — ihre Ideen haben Architektur und UX geprägt:

### Agent-Frameworks

| Projekt | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent-Berechtigungsmodell, Thinking-Regler, Tool-Call-Visualisierung, Sub-Agent-Delegation, Hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Kontext-Kompaktierung, Tool-Call-Loop-Erkennung, Event-Stream-Architektur |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Iterationsbudget, strukturierter Langzeitspeicher, autonome Skills |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, Kontext-Kompression, Tool-Call-Reparatur |
| [DS4](https://github.com/antirez/ds4) | Hierarchische Aufgabenzerlegung |

### UI & UX

| Projekt | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva Copy-Paste-Komponentenmethodik |
| [Magic UI](https://github.com/magicuidesign/magicui) | Animationsmuster (shimmer, blur-fade) |

### Infrastruktur

| Projekt | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Normalisierung von Multi-Format-Anbietern |
| [MCP](https://modelcontextprotocol.io) | Der Standard, den Aether’s Agent spricht |
| [cc-switch](https://github.com/farion1231/cc-switch) | Layout des Nutzungsstatistik-Dashboards |
| [new-api](https://github.com/QuantumNous/new-api) | Reasoning-Effort-Relay, Nutzungs-/Kostenverfolgung |
| [Continue](https://github.com/continuedev/continue) | Konfiguration als Quelle der Wahrheit, Provider-Abstraktion |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Mehrschrittige Agent-Ausführung, Sandbox-Tool-Ausführung |
| [Aider](https://github.com/Aider-AI/aider) | LLM-Coding-Assistant-Tool-Loop, git-Integration |
| [Cline](https://github.com/cline/cline) | IDE-eingebetteter Agent, MCP-Integration, Berechtigungs-UX |

---

## Mitwirken

Alle Beiträge sind willkommen! Ob Bugfix, Feature-Wunsch, Übersetzungsverbesserung oder Dokumentations-Update — bitte öffnen Sie ein Issue oder reichen Sie einen PR ein.

1. Forken Sie das Repo
2. Erstellen Sie einen Feature-Branch (`git checkout -b feat/my-feature`)
3. Committen Sie Ihre Änderungen (`git commit -am 'Add feature'`)
4. Pushen Sie den Branch (`git push origin feat/my-feature`)
5. Öffnen Sie einen Pull Request

Siehe [CONTRIBUTING.md](./CONTRIBUTING.md) für ausführliche Richtlinien.

---

## Lizenz

[MIT](./LICENSE) © 2025 Aether

---

<div align="center">

Mit ❤️ gebaut mit Electron + React + TypeScript

[⬆ Nach oben](#aether)

</div>
