<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)
---

---

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [簡体字中国語](./README.zh-CN.md) · [繁体字中国語](./README.zh-TW.md) · [文言中国語](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)


---

> **ステータス: ベータ。** AetherAI は個人/趣味プロジェクトです。動作しますが、荒い部分があります。バグ報告は歓迎します — [CONTRIBUTING.md](./CONTRIBUTING.md) と [SECURITY.md](./SECURITY.md) を参照してください。


AetherAI は、複数の LLM プロバイダ（OpenAI / Claude / DeepSeek / ローカルモデル / OpenAI 互換の任意のエンドポイント）を一つのデスクトップアプリに統合します。すべてのデータはローカルに保存されます。API キーや会話履歴は、あなたが設定したプロバイダ以外の外部に送信されることはありません。

## 🎯 AetherAI の違い

AetherAI は、通常複数のツールに分散している機能を一つのローカルデスクトップアプリに統合します：

| 機能 | 説明 | 成熟度 |
|---|---|:---:|
| **マルチプロバイダチャット** | OpenAI、Claude、DeepSeek、OpenAI 互換エンドポイント間で会話中に切り替え。 | `安定` |
| **エージェントツールループ** | 16 個の内蔵ツール、Plan-Act-Observe ループ、サンドボックス、パーミッション階梯。 | `ベータ` |
| **マルチモデルアリーナ** | 一つのプロンプトを複数のモデルに送信、最高の回答に投票、ELO ランキングを追跡。 | `ベータ` |
| **スキルと拡張性** | ドロップイン `SKILL.md` ファイル、MCP サーバー、10 ポイントフックシステム。 | `実験的` |
| **構造化メモリ** | エージェントがセッションを超えて設定や過去の意思決定を思い出せる。 | `ベータ` |
| **階層的計画** | 複雑なリクエストを自動的に並列サブタスクに分解。 | `実験的` |
| **コンテキスト圧縮** | 長い会話を自動要約しつつ tool-call/result ペアを保持。 | `ベータ` |
| **ローカルファーストプライバシー** | 会話、キー、ペルソナをローカル SQLite に保存。機械の外には何も出ない。 | `安定` |
| **15 の UI 言語** | 中国語（簡体/繁体/文言）と RTL アラビア語を含む。 | `ベータ` |
| **MIT ライセンス** | 完全にオープンソース。 | `安定` |

---

## ✨ 主な機能

**ステータスラベル：** `安定` = 日常的に使用可能、`ベータ` = 既知の荒さがあるが使用可能、`実験的` = 新しく高度な機能で変更される可能性がある、`計画` = 既にロードマップに記載済み。

### 🖥️ チャット

| 機能 | 状態 | 説明 |
|---|:---:|---|
| **マルチプロバイダ** | `安定` | シングルアダプタレイヤー。OpenRouter、Together、DeepSeek、Ollama、LM Studio などをカバー。 |
| **並列ストリーミング** | `安定` | 一つチャットがストリーミング中も、別のチャットで会話を続けられる。 |
| **思考強度スライダー** | `ベータ` | OpenAI o シリーズ / gpt-5 / Claude リレー経由。推論モデルにのみ有効。 |
| **添付ファイル** | `ベータ` | テキストファイルはコンテキストとして；画像はマルチモーダル（ビジョンモデルが必要）。 |
| **長文ペースト折りたたみ** | `安定` | 数百行が展開可能なスニペットに自動折りたたみ（ChatGPT 風）。 |
| **メッセージ編集** | `安定` | 任意の地点から上書き＋再生成。 |
| **メッセージ検索** | `安定` | 全メッセージでハイライト表示。 |
| **サイドバー要約** | `ベータ` | モデル生成のトピックフレーズ、コピーされたテキストではない。 |

### 🤖 エージェント（関数呼び出し）

- `ベータ` **16 個の内蔵ツール**（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`、`use_skill`、`ask_user`、`todo_write`）、Plan-Act-Observe ループ、ライブ推論トレース＋タスクリスト、ループ検出、ツール별 タイムアウト、設定可能イテレーション予算（デフォルト 25 ラウンド）、コンテキスト圧縮。
- `実験的` **階層的計画** — 複雑なリクエストのタスク分解を自動生成（DS4 啓発）。
- `実験的` **サブエージェント委譲** — 独立サブタスクを `delegate_task` で並列実行。
- `安定` **権限モード** — リスク上昇階梯：

| モード | 説明 | サンドボックス |
|---|---|:---:|
| **オフ** | 単なるチャット、ツールなし | N/A |
| **計画** | 読み取り専用ツール（変更なく調査） | - |
| **確認** | 各リスク操作を確認（推奨） | - |
| **自動** | 全操作を実行、確認なし | あり |
| **Yolo** | 全許可、サンドボックスなし | なし |

- `安定` **ワークスペースサンドボックス** — 設定したワークスペースルート外での `write_file`/`edit_file` を拒否；`run_command` は破壊的パターンをブロック。設定 - エージェントとセキュリティで設定可能。
- `ベータ` **コンテキスト圧縮** — 古い履歴を自動要約（tool-call/result ペアはそのまま保持；識別子はそのまま維持）。
- `ベータ` **ツール呼び出し修復** — 不正な JSON、引数欠落、未引用キー、切り詰められた呼び出しを自動修復。

### 🧠 メモリと学習

- `ベータ` **自動長期メモリ** — 各ターン前に関連メモリを注入；重要事実を自動抽出・保存。設定で切り替え可能。
- `実験的` **習慣学習** — 繰り返される設定（例：「常に Claude を使用する」）を検出し、自動適用されるスキルを提案。
- `ベータ` **監査ログ** — デバッグ用ターン別エージェント実行トレース。

### 🏟️ アリーナ

- `ベータ` **マルチモデルアリーナ** — 一つのプロンプトで、複数のモデルが**同時**に回答——最高の回答に投票すると**ELO リーダーボード**が自動更新。モデルは**意図ごとに**スコアリングされる（コーディング / 数学 / 翻訳 / 要約 / 全般）。*ローカルファーストのデスクトップチャットアプリで ELO を搭載した内蔵マルチモデルアリーナを搭載しているものは他にありません。*

### 🛠️ スキルと拡張性

| コンポーネント | フォーマット | 状態 | 詳細 |
|---|---|:---:|---|
| **スキル** | `SKILL.md` | `実験的` | `<workspace>/.claude/skills/` にドロップ；`release-checklist` と `git-commit` を同梱 |
| **スラッシュコマンド** | `CMD.md` | `安定` | 6 個内蔵：`/code`、`/continue`、`/explain`、`/polish`、`/summarize`、`/translate` |
| **フック** | スクリプト | `実験的` | 10 個のライフサイクルポイント：PreToolUse、PostToolUse、ToolError、PreCompact、PostCompact、PreSend、PostResponse、SessionStart、SessionEnd、SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `ベータ` | 外部 MCP サーバーは内蔵ツールに自動マージ |

### ⚙️ カスタマイズ

| 設定 | 状態 | 説明 |
|---|:---:|---|
| **高度なモデル設定** | `安定` | Max tokens、temperature、top_p、カスタムシステムプレフィックス、言語別自動タイトル、思考強度 |
| **カスタム背景** | `安定` | 不透明度 / ブラー制御付きで画像をアップロード |
| **ペルソナ** | `安定` | システムプロンプトプリセット、セッションごとに切り替え |
| **テーマ** | `安定` | ライト / ダーク / ブルー / ガラス / レトロ |
| **15 の UI 言語** | `ベータ` | English、中国語（簡/繁/文言）、日本語、スペイン語、フランス語、ドイツ語、ポルトガル語、ロシア語、ウクライナ語、アラビア語（RTL）、ヒンディー語、韓国語 |
| **自動更新** | `ベータ` | NSIS インストーラーが起動時にチェック；ポータブル版もサポート（手動インストール） |
| **利用追跡** | `ベータ` | API コール別のログ（tokens、コスト、レイテンシ、キャッシュヒット率） |

### 🔒 プライバシー

> **すべてのデータはローカルに保持されます。** AetherAI はあなたについて何も収集せず、何もアップロードしません。API キー、会話、ペルソナはローカル SQLite データベースに保存されます。外部へのネットワークリクエストは、あなたが設定した LLM プロバイダのみに行われます。

---

## 📸 スクリーンショット

> `assets/screenshots/` 内のスクリーンショットを以下に更新してください。

| フロー | プレビュー |
|---|:---:|
| チャットストリーミング | `assets/screenshots/chat-streaming.gif` — _TODO_ |
| エージェントツール実行 | `assets/screenshots/agent-tool-execution.gif` — _TODO_ |
| アリーナ投票 | `assets/screenshots/arena-voting.gif` — _TODO_ |
| プロバイダ設定 | `assets/screenshots/provider-settings.png` — _TODO_ |

---

## 📦 ダウンロード

### Windows — プリビルド（推奨）

最新 [Release](https://github.com/TQSY114514/AetherAI/releases) をダウンロード：

| ビルド | 説明 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS インストーラー。ユーザーインストール（管理者不要）、アプリ内自動更新。**推奨。** |
| **`AetherAI-x.y.z.exe`** | ポータブル単一実行ファイル。インストール不要、自動更新なし；そのまま実行。 |

> インストーラーは初回起動時に SmartScreen「不明な発行元」警告を表示します——署名なしの個人アプリとしては正常です。すべてのデータはローカルに保持されます。

---

## 🚀 クイックスタート

### ソースからインストール

**前提条件：** Node.js 18+、npm 9+

```bash
cd app
npm install
npm run dev      # 開発（ホットリロード）
npm run build    # 本番フロントエンドをビルド
npm start        # Electron を起動
```

または Windows でリポジトリルートの `start.bat` を実行。

### プロバイダを設定

1. 起動後、サイドバーの **Models** をクリック。
2. プロバイダを追加（名前 / API URL / API Key）。
3. **Fetch models** をクリックして利用可能なモデル一覧を取得。
4. チャットに戻って会話を開始。

### 確認モードを有効化

1. **設定 - エージェントとセキュリティ** を開く。
2. エージェントの権限モードを **確認** に設定。
3. ワークスペースルートがエージェントに读写させたいフォルダであることを確認。
4. 無制限アクセスを望まない限り、**Yolo** を無効にしたままにする。

### 最初のエージェントタスクを実行

1. 新しいチャットを開く。
2. `List the files in this project and summarize what the app does.` と入力。
3. 各ツール呼び出しを確認。安全な読み取りを承認、不審な操作を拒否。
4. ライブ推論トレースと最終回答を確認。

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

## 🔑 テックスタック

| レイヤー | 技術 |
|---|---|
| デスクトップ | Electron 31 |
| フロントエンド | React 18.3 + TypeScript 5.5 |
| 状態管理 | Zustand 4.5 |
| ビルド | Vite 5.4 + electron-builder |
| データベース | sql.js（SQLite in-memory、ディスクに永続化） |
| LLM | OpenAI 互換 + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | カスタム stdio JSON-RPC 2.0 クライアント |

---

## 🤝 オープンソースプロジェクトへの感謝

AetherAI stands on the shoulders of these projects — their ideas shaped the architecture and UX:

### Agent frameworks

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

### Infrastructure

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

## 🤝 貢献

すべての貢献を歓迎します！バグ修正、機能リクエスト、翻訳改善、ドキュメント更新——issue を開くか PR を送信してください。

1. リポジトリをフォーク
2. 機能ブランチを作成（`git checkout -b feat/my-feature`）
3. 変更をコミット（`git commit -am 'Add feature'`）
4. ブランチにプッシュ（`git push origin feat/my-feature`）
5. Pull Request を開く

詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。

---

## 📄 ライセンス

[MIT](./LICENSE) 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
