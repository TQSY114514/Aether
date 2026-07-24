<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**ローカルファーストのマルチモデル デスクトップ AI チャットクライアント · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **ステータス: ベータ。** AetherAI は個人/趣味プロジェクトです。動作しますが、荒い部分があります。バグ報告は歓迎します — [CONTRIBUTING.md](./CONTRIBUTING.md) と [SECURITY.md](./SECURITY.md) を参照してください。


AetherAI は、複数の LLM プロバイダ（OpenAI / Claude / DeepSeek / ローカルモデル / OpenAI 互換の任意のエンドポイント）を一つのデスクトップアプリに統合します。すべてのデータはローカルに保存されます。API キーや会話履歴は、あなたが設定したプロバイダ以外の外部に送信されることはありません。

## 📑 Table of Contents

- [✨ 主な機能](#-主な機能)
  - [🖥️ チャット](#️-chat)
  - [🤖 エージェント（関数呼び出し）](#-エージェント関数呼び出し)
  - [🔒 プライバシー](#-privacy)
- [🚀 クイックスタート](#-クイックスタート)
- [📁 プロジェクト構成](#-プロジェクト構成)
- [🗺️ ロードマップ](#️-ロードマップ)
- [🤝 謝辞](#-謝辞)
- [📋 Changelog](#-changelog)
- [📄 ライセンス](#-ライセンス)

---

## ✨ 主な機能

### 🖥️ チャット

- **プロバイダ抽象化** — 単一のアダプタレイヤーを採用。プロバイダのフォーマットを追加する際はファイル一つで済みます。現在は OpenAI 互換に対応（OpenRouter、Together、DeepSeek、Ollama の OpenAI シム、LM Studio などを網羅）。
- **マルチセッションの並列ストリーミング** — あるチャットでストリーミングしながら、別のチャットで会話を続けられます。
- **Arena** — 一つのプロンプトに対し複数のモデルが同時に回答。最も良いものに投票すると、ELO リーダーボードが自動的に更新されます。
- **ペルソナ** — システムプロンプトのプリセット。セッションごとに切り替え可能。
- **添付ファイル** — テキストファイルはコンテキストとして注入され、画像はマルチモーダル入力として扱われます（ビジョンモデルが必要）。
- **長文ペーストの折りたたみ** — 何百行ものテキストを貼り付けると、展開可能なスニペットに自動的に折りたたまれます（ChatGPT 風）。
- **思考強度スライダー** — 実際のパラメータに連動。OpenAI o シリーズ → `reasoning_effort`、Claude → `thinking.budget_tokens`。
- **サイドバー要約** — タイトルはモデルが生成した話題のフレーズ（例：「新英雄天使 引き advice」）であり、テキストの単なるコピーではありません。
- **詳細設定** — max tokens、temperature、top_p、カスタムシステムプレフィックス、言語ごとの自動タイトル生成。
- **カスタム背景** — 画像をアップロードし、不透明度 / ぼかしを調整できます。
- **15 種類の UI 言語** — English（標準 + 逆さま）、中文（简体/繁體/文言）、日本語、español、français、Deutsch、português、русский、українська、العربية（RTL）、हिन्दी、한국어。
- **テーマ** — Light / Dark / Blue / Glass / Retro。

### 🤖 エージェント（関数呼び出し）

- **13 個の組み込みツール**（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`）を備え、Plan→Act→Observe のループとリアルタイムの推論トレースを表示します。
- **エージェントの権限モード** — Off / Ask（リスクのあるツールを都度確認）/ Auto（すべて許可）/ Plan（読み取り専用）。コーディングエージェントの権限モデルを踏襲しています。
- **MCP サポート** — 外部の stdio MCP サーバーに接続。そのツールは組み込みツールに自動的に統合されます。
- **Tool call repair** — LLMs はたまに不正な JSON を生成することがあります。エージェントループは実行前に欠落した引数、未引用のキー、切り詰められた呼び出しを自動的に修復します。

---

## 🚀 クイックスタート

### 前提条件
- Node.js 18+
- npm 9+

### インストールと実行
```bash
cd app
npm install
npm run dev      # 開発モード（ホットリロード）
npm run build    # 本番用フロントエンドをビルド
npm start        # Electron を起動
```

Windows では、リポジトリルートの `start.bat` を実行することもできます。

### 最初のプロバイダを設定する
1. 起動後、サイドバーの **Models** をクリックします。
2. プロバイダを追加します（名前 / API URL / API Key）。
3. **Fetch models** をクリックして、利用可能なモデル一覧を取得します。
4. チャットに戻り、会話を始めます。

---

## 📁 プロジェクト構成

```
app/
├── electron/              # メインプロセス（Node）
│   ├── database.js        # SQLite（sql.js）データ層
│   ├── ipc/               # IPC ハンドラ（chat / arena / session / mcp / ...）
│   ├── llm/               # LLM 抽象化
│   │   ├── providerAdapter.js   # api_format によるディスパッチ
│   │   ├── openaiAdapter.js     # OpenAI 互換の実装
│   │   ├── reasoning.js         # 思考強度パラメータのビルダー
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
│   ├── tools/             # 組み込みツールのレジストリ
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # MCP クライアント + マネージャー
│   ├── main.js / preload.js
├── src/                   # レンダラ（React + TS）
│   ├── store/index.ts     # zustand グローバル状態
│   ├── components/        # UI（chat / sidebar / settings / ui）
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n（15 ロケール）/ theme / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, …)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## 🗺️ ロードマップ

| Milestone | Status | Description |
|-----------|--------|-------------|
| v0.5 — Agent foundation | ✅ | Tool loop, planning, sandbox, permissions, hooks |
| v0.6 — Memory & Skills | ✅ | Auto memory, habit learner, slash commands, tool repair |
| v0.7 — Quality & Polish | 🔄 | Error boundaries, perf profiling, test coverage |
| v0.8 — Multi-model polish | ⬜ | Arena UX, ELO calibration, intent-based routing |
| v0.9 — Plugins & Extensibility | ⬜ | Skill marketplace, hook sharing, plugin SDK |
| v1.0 — Stable release | ⬜ | Signed installer, auto-update, changelog generation |

---

## 🤝 謝辞

AetherAI は以下のプロジェクトの肩の上に立っています。そのアイデアがアーキテクチャと UX を形作りました。

- [Claude Code](https://github.com/anthropics/claude-code) — エージェントの権限モデル、思考強度スライダー、ツール呼び出しの可視化、新規チャットの空状態。
- [Continue](https://github.com/continuedev/continue) — 宣言的な設定を唯一の真実の情報源とする手法、プロバイダ抽象化、関数呼び出しプロトコル。
- [Dify](https://github.com/langgen/dify) — 複数フォーマットのプロバイダ正規化パターン。
- [Model Context Protocol](https://modelcontextprotocol.io) — AetherAI のエージェントが話す MCP 仕様。
- [shadcn/ui](https://github.com/shadcn-ui/ui) — cn() / cva のコピーペーストコンポーネント手法。
- [Magic UI](https://github.com/magicuidesign/magicui) — アニメーションパターン（ストリーミングテキスト、シマー、ブラーフェード）。
- [new-api](https://github.com/QuantumNous/new-api) — 推論強度リレー変換の参考実装。
- [OpenClaw](https://github.com/openclaw/openclaw) — README の洗練とオンボーディングの着想。
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

## 📄 ライセンス

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
