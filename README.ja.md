<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `個人 / 趣味プロジェクト` · `MIT ライセンス`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **ステータス: Beta。** AetherAI は個人/趣味プロジェクトです。動作しますが、荒い部分があります。バグ報告を歓迎します — [CONTRIBUTING.md](./CONTRIBUTING.md) と [SECURITY.md](./SECURITY.md) を参照してください。

複数の LLM プロバイダ — OpenAI / Claude / DeepSeek / ローカルモデル / OpenAI 互換の任意のエンドポイント — を一つのデスクトップアプリに統合します。ファイルの読み書きやコマンド実行を行うエージェント、ワークスペースサンドボックス、ELO 投票付きマルチモデルアリーナ、スキル、そして 15 の UI 言語。すべてのデータはローカルに保存されます。API キーや会話は、あなたが設定したプロバイダ以外の外部に送信されることはありません。

---

## AetherAI の特徴

AetherAI は、通常複数のツールに分散している機能を一つのローカルデスクトップアプリに統合します：

| 機能 | 説明 | 成熟度 |
|---|---|:---:|
| **マルチプロバイダチャット** | OpenAI、Claude、DeepSeek、OpenAI 互換エンドポイント間で会話中に切り替え。 | `Stable` |
| **エージェントツールループ** | 16 個の内蔵ツール、Plan-Act-Observe ループ、サンドボックス、パーミッション階梯。 | `Beta` |
| **マルチモデルアリーナ** | 一つのプロンプトを複数のモデルに送信、最高の回答に投票、ELO ランキングを追跡。 | `Beta` |
| **スキルと拡張性** | ドロップイン `SKILL.md` ファイル、MCP サーバー、10 ポイントフックシステム。 | `Experimental` |
| **構造化メモリ** | エージェントがセッションをまたいで設定や過去の意思決定を記憶。 | `Beta` |
| **階層的計画** | 複雑なリクエストを自動的に並列サブタスクに分解。 | `Experimental` |
| **コンテキスト圧縮** | 長い会話を自動要約しつつ tool-call ペアを保持。 | `Beta` |
| **ローカルファーストプライバシー** | 会話、キー、ペルソナをローカル SQLite に保存。機械の外には何も出ない。 | `Stable` |
| **15 の UI 言語** | 中国語（文言）と RTL アラビア語を含む。 | `Beta` |
| **MIT ライセンス** | 完全にオープンソース。 | `Stable` |

---

## ダウンロード

### Windows — プリビルドインストーラー（ほとんどのユーザーに推奨）

最新の [Release](https://github.com/TQSY114514/Aether/releases) をダウンロード：

| ビルド | 説明 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS インストーラー。ユーザー単位（管理者不要）、アプリ内自動更新。**推奨。** |
| **`AetherAI-x.y.z.exe`** | ポータブル単一 exe。インストール不要、自動更新なし；そのまま実行。 |

> インストーラーは初回起動時に SmartScreen「不明な発行元」警告を表示します — 署名なしの個人アプリとしては正常です。すべてのデータはローカルに保持されます。
>
> ⚠️ アプリが署名なしのため、一部のアンチウイルスソフトがパッケージング中の展開済み `electron.exe` を隔離することがあります。インストーラーが AV に削除された場合は、除外設定を追加するかポータブル版を使用してください。

### ソースから実行（開発者 / パワーユーザー）

ソースから実行したい場合、またはコードを修正したい場合は、`start.bat` を使用します（[Node.js 18+](https://nodejs.org) が必要）：

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: 依存関係インストール、フロントエンドビルド、Electron 起動
```

手順については [クイックスタート](#-quick-start) を参照。

> **exe vs start.bat** — 両方サポートされており、異なる対象者に対応します：
> - **インストーラー exe** — エンドユーザー向け：ダブルクリックでインストール、スタートメニュー登録、アプリ内自動更新、Node.js 不要。
> - **start.bat** — 開発者 / 改造者向け：透明な `npm install` → `vite build` → `electron .` パイプライン、エディット＆ラン、Node.js 必要。

---

## クイックスタート

**前提条件：** Node.js 18+、npm 9+

```bash
cd app
npm install
npm run dev      # 開発（ホットリロード）
npm run build    # 本番フロントエンド
npm start        # Electron を起動
```

または Windows でリポジトリルートの `start.bat` を実行。

### プロバイダを設定

1. 起動後、サイドバーの **Models** をクリック。
2. プロバイダを追加（名前 / API URL / API Key）。
3. **Fetch models** をクリックして利用可能なモデル一覧を取得。
4. チャットに戻って会話を開始。

### Ask モードを有効化

1. **Settings - Agent & Safety** を開く。
2. エージェントの権限モードを **Ask** に設定。
3. ワークスペースルートがエージェントに読み書きさせたいフォルダであることを確認。
4. 無制限アクセスを望まない限り、**Yolo** を無効のままにする。

### 最初のエージェントタスクを実行

1. 新しいチャットを開く。
2. こう尋ねる：`List the files in this project and summarize what the app does.`
3. 各ツール呼び出し提案を確認。安全な読み取りを承認；予期しないものは拒否。
4. ライブ推論トレースと最終回答を確認。

---

## 機能

**ステータスラベル：** `Stable` = 日常使用可能、`Beta` = 既知の荒さがあるが使用可能、`Experimental` = 新規/高度な機能で変更される可能性、`Planned` = ロードマップに記載済み。

### チャット

| 機能 | ステータス | 説明 |
|---|:---:|---|
| **マルチプロバイダ** | `Stable` | シングルアダプタレイヤー；プロバイダ追加 = 1 ファイル。OpenRouter、Together、DeepSeek、Ollama、LM Studio などをカバー。 |
| **並列ストリーミング** | `Stable` | 一つのチャットがストリーミング中も別のチャットで会話を続けられる。 |
| **思考強度スライダー** | `Beta` | 実パラメータ：OpenAI o シリーズ / gpt-5 / Claude リレー経由。推論モデルにのみ有効。 |
| **添付ファイル** | `Beta` | テキストファイルはコンテキストとして；画像はマルチモーダル（ビジョンモデルが必要）。 |
| **長文ペースト折りたたみ** | `Stable` | 数百行が展開可能なスニペットに自動折りたたみ（ChatGPT 風）。 |
| **メッセージ編集** | `Stable` | 上書き＋任意の地点から再生成。 |
| **メッセージ検索** | `Stable` | 全メッセージでハイライト表示。 |
| **サイドバー要約** | `Beta` | モデル生成のトピックフレーズ、コピーされたテキストではない。 |

### エージェント（関数呼び出し）

- `Beta` **16 個の内蔵ツール**（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`、`use_skill`、`ask_user`、`todo_write`）と Plan-Act-Observe ループ、ライブ推論トレース＋タスクリスト、ループ検出、ツール別タイムアウト、設定可能イテレーション予算（デフォルト 25 ラウンド）、コンテキスト圧縮。
- `Experimental` **階層的計画** — 複雑なリクエストのタスク分解を自動生成（DS4 啓発）。
- `Experimental` **サブエージェント委譲** — 独立サブタスクを `delegate_task` で並列実行。
- `Stable` **権限モード** — リスク上昇階梯：

| モード | 説明 | サンドボックス |
|---|---|:---:|
| **Off** | 通常チャット、ツールなし | N/A |
| **Plan** | 読み取り専用ツール（変更なしで調査） | - |
| **Ask** | 各リスク操作を確認（推奨） | - |
| **Auto** | すべて実行、確認なし | あり |
| **Yolo** | 全許可、サンドボックスなし | なし |

- `Stable` **ワークスペースサンドボックス** — 設定したワークスペースルート外での `write_file`/`edit_file` を拒否；`run_command` は破壊的パターンをブロック。Settings - Agent & Safety で設定可能。
- `Beta` **コンテキスト圧縮** — 古い履歴を自動要約（tool-call/result ペアはそのまま保持；識別子はそのまま維持）。
- `Beta` **ツール呼び出し修復** — 不正な JSON、引数欠落、未引用キー、切り詰められた呼び出しを自動修復。

### メモリと学習

- `Beta` **自動長期メモリ** — 各ターン前に関連メモリを注入；重要事実を自動抽出・保存。Settings - Agent で切り替え可能。
- `Experimental` **習慣学習** — 繰り返される設定（例：「常に Claude を使用する」）を検出し、自動適用されるスキルを提案。
- `Beta` **監査ログ** — デバッグ用ターン別エージェント実行トレース。

### アリーナ

- `Beta` **マルチモデルアリーナ** — 一つのプロンプトで、複数のモデルが**同時**に回答；最高の回答に投票すると **ELO リーダーボード**が自動更新。モデルは**意図ごとに**スコアリング（コーディング / 数学 / 翻訳 / 要約 / 全般）。*ELO を搭載した内蔵マルチモデルアリーナを備えたローカルファーストのデスクトップチャットアプリは他にありません。*

### スキルと拡張性

| コンポーネント | フォーマット | ステータス | 詳細 |
|---|---|:---:|---|
| **スキル** | `SKILL.md` | `Experimental` | `<workspace>/.claude/skills/` にドロップ；`release-checklist` と `git-commit` を同梱 |
| **スラッシュコマンド** | `CMD.md` | `Stable` | 6 個内蔵：`/code`、`/continue`、`/explain`、`/polish`、`/summarize`、`/translate` |
| **フック** | スクリプト | `Experimental` | 10 個のライフサイクルポイント：PreToolUse、PostToolUse、ToolError、PreCompact、PostCompact、PreSend、PostResponse、SessionStart、SessionEnd、SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | 外部 MCP サーバーは内蔵ツールに自動マージ |

### カスタマイズ

| 設定 | ステータス | 説明 |
|---|:---:|---|
| **高度なモデル設定** | `Stable` | Max tokens、temperature、top_p、カスタムシステムプレフィックス、言語別自動タイトル、思考強度 |
| **カスタム背景** | `Stable` | 不透明度 / ブラー制御付きで画像をアップロード |
| **ペルソナ** | `Stable` | システムプロンプトプリセット、セッションごとに切り替え |
| **テーマ** | `Stable` | ライト / ダーク / ブルー / ガラス / レトロ |
| **15 の UI 言語** | `Beta` | English、Chinese (簡/繁/文言)、Japanese、Spanish、French、German、Portuguese、Russian、Ukrainian、Arabic (RTL)、Hindi、Korean |
| **自動更新** | `Beta` | NSIS インストーラーが起動時にチェック；ポータブル版もチェック（手動インストール） |
| **利用追跡** | `Beta` | API コール別ログ（tokens、コスト、レイテンシ、キャッシュヒット率） |

### プライバシー

> **すべてのデータはローカルに保持されます。** AetherAI はあなたについて何も収集せず、何もアップロードしません。API キー、会話、ペルソナはローカル SQLite データベースに保存されます。外部へのネットワークリクエストは、あなたが設定した LLM プロバイダのみに行われます。

---

## プロジェクト構成

```
app/
├── electron/              # メインプロセス (Node)
│   ├── database.js        # SQLite (sql.js) データ層 — 14 テーブル
│   ├── ipc/               # IPC ハンドラ (chat / arena / session / mcp / ...)
│   │   ├── chat.handler.js    # 中央ハンドラ (540 行)
│   │   ├── arena.handler.js   # ELO 付きマルチモデルアリーナ
│   │   ├── agent.handler.js   # ワークスペース管理
│   │   └── ...
│   ├── llm/               # LLM 抽象化 (~3,700 行、19 ファイル)
│   │   ├── providerAdapter.js # api_format でディスパッチ (openai/anthropic)
│   │   ├── openaiAdapter.js   # OpenAI 互換 SSE ストリーミング + リトライ
│   │   ├── anthropicAdapter.js# Anthropic Messages API
│   │   ├── credentialPool.js  # マルチキーローテーション + クールダウン
│   │   ├── toolLoop.js        # イテレーション予算付き Plan-Act-Observe
│   │   ├── planning.js        # 階層的タスク分解
│   │   ├── subAgent.js        # 並列サブエージェント委譲
│   │   ├── compaction.js      # コンテキスト圧縮 (ペア保持)
│   │   ├── autoMemory.js      # 長期構造化メモリ
│   │   ├── habitLearner.js    # 繰り返される設定 -> 自動スキル
│   │   ├── hooks.js           # 10 ポイント拡張フック
│   │   ├── skills.js          # SKILL.md ローダー (Claude Code フォーマット)
│   │   ├── modelAdvisor.js    # ヒューリスティックモデル提案
│   │   ├── toolCallRepair.js  # 不正ツール呼び出し回復
│   │   ├── auditLog.js        # ターン別エージェント実行トレース
│   │   └── ...
│   ├── tools/             # 内蔵ツールレジストリ + サンドボックス
│   │   ├── registry.js       # 16 ツール定義 (OpenClaw 啓発)
│   │   └── sandbox.js        # 3 層防御 (ワークスペースルート、トラバーサルガード、ブロックリスト)
│   ├── mcp/               # MCP クライアント + サーバーマネージャ
│   ├── main.js / preload.js
├── src/                   # レンダラー (React + TS + Zustand)
│   ├── store/index.ts     # Zustand グローバル状態 (~1,000 行)
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 ロケール) / theme / markdown
│   └── types/
├── skills/                # 内蔵スキル (release-checklist, git-commit)
├── commands/              # 内蔵スラッシュコマンド (/code, /explain, /polish, ...)
├── locales/               # 翻訳ファイル (13 言語、遅延ロード)
└── resources/             # アプリアイコン
```

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| デスクトップ | Electron 31 |
| フロントエンド | React 18.3 + TypeScript 5.5 |
| 状態 | Zustand 4.5 |
| ビルド | Vite 5.4 + electron-builder |
| データベース | sql.js (SQLite in-memory、ディスクに永続化) |
| LLM | OpenAI 互換 + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | カスタム stdio JSON-RPC 2.0 クライアント |

---

## 謝辞

AetherAI はこれらのプロジェクトの肩の上に成り立っています — そのアイデアがアーキテクチャと UX を形作りました：

### Agent frameworks

| Project | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | エージェント権限モデル、思考スライダー、ツール呼び出し可視化、サブエージェント委譲、フック |
| [OpenClaw](https://github.com/openclaw/openclaw) | コンテキスト圧縮、ツール呼び出しループ検出、イベントストリームアーキテクチャ |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | イテレーション予算、構造化長期メモリ、自律スキル |
| [OpenAI Codex](https://github.com/openai/codex) | サンドボックス化、コンテキスト圧縮、ツール呼び出し修復 |
| [DS4](https://github.com/antirez/ds4) | 階層的タスク分解 |

### UI & UX

| Project | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva コピーペーストコンポーネント手法 |
| [Magic UI](https://github.com/magicuidesign/magicui) | アニメーションパターン (shimmer、blur-fade) |

### Infrastructure

| Project | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | マルチフォーマットプロバイダ正規化 |
| [MCP](https://modelcontextprotocol.io) | AetherAI のエージェントが話す仕様 |
| [cc-switch](https://github.com/farion1231/cc-switch) | 利用統計ダッシュボードレイアウト |
| [new-api](https://github.com/QuantumNous/new-api) | 推論強度リレー、利用/コスト追跡 |
| [Continue](https://github.com/continuedev/continue) | 設定を真実の情報源とする、プロバイダ抽象化 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | マルチターンエージェント実行、サンドボックス化ツール実行 |
| [Aider](https://github.com/Aider-AI/aider) | LLM コーディングアシスタントツールループ、git 統合 |
| [Cline](https://github.com/cline/cline) | IDE 埋め込みエージェント、MCP 統合、権限 UX |

---

## コントリビュート

すべての貢献を歓迎します！バグ修正、機能リクエスト、翻訳改善、ドキュメント更新 — issue を開くか PR を送信してください。

1. リポジトリをフォーク
2. 機能ブランチを作成（`git checkout -b feat/my-feature`）
3. 変更をコミット（`git commit -am 'Add feature'`）
4. ブランチにプッシュ（`git push origin feat/my-feature`）
5. Pull Request を開く

詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。

---

## ライセンス

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
