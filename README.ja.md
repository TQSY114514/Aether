<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/readme-hero-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="./assets/readme-hero-light.png" />
  <img src="./assets/readme-hero.png" width="620" alt="Aether — Local-first Multi-Model AI Workbench" />
</picture>

# Aether

### 高確信度のローカルファースト AI エンジニアリングワークベンチ。Zero Slop。

モデルの実証評価、プロジェクト作業スペースの文脉、受控されたエージェント実行をシームレスに統合するポストデジタル・ミニマリズム開発ワークベンチ。

プレフィックスキャッシュ安全な二層ツールルーティング · 二元 Plan/Act ゲートと即時スナップショットロールバック · 邪魔にならない不可視メモリ · 高コントラストな白黒インダストリアルデザイン。

[![release](https://img.shields.io/github/v/release/TQSY114514/Aether.svg?style=flat-square&color=8250df&labelColor=161b22&label=release)](https://github.com/TQSY114514/Aether/releases)
[![downloads](https://img.shields.io/github/downloads/TQSY114514/Aether/total?style=flat-square&color=3fb950&labelColor=161b22&logo=github&logoColor=white&label=downloads)](https://github.com/TQSY114514/Aether/releases)
[![npm downloads](https://img.shields.io/npm/dt/aetherai.svg?style=flat-square&color=3fb950&labelColor=161b22&logo=npm&logoColor=white&label=downloads)](https://www.npmjs.com/package/aetherai)
[![npm](https://img.shields.io/npm/v/aetherai.svg?style=flat-square&color=cb3837&labelColor=161b22&logo=npm&logoColor=white)](https://www.npmjs.com/package/aetherai)
[![ci](https://img.shields.io/github/actions/workflow/status/TQSY114514/Aether/ci.yml?branch=master&event=push&style=flat-square&label=ci&labelColor=161b22&logo=githubactions&logoColor=white)](https://github.com/TQSY114514/Aether/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-8b949e?style=flat-square&labelColor=161b22&label=license)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square&labelColor=161b22&logo=windows&logoColor=white)](#デスクトップ版-windows--推奨)

[English](./README.md) · [简体中文](./README.zh-CN.md) · **[日本語](./README.ja.md)**

</div>

---

## 60 秒でわかる Aether

市販の多くの AI コーディングツールは単一のモデルを選択して盲信することを求めます。Aether はモデルをプラグイン可能なコンピュートエンジンとして扱い、コントロール権を常にあなたへ提供します:

1. **実際のタスクで実測（Arena 2.0）。** 内蔵の**アリーナ (Arena)** を開き、1つのプロンプトを複数のモデルに並行して送信し、最良の回答に投票。タスク種別（コーディング、推論、翻訳）ごとにローカル ELO レーティングがリアルタイムに更新され、勝者モデルの生成差分（Diff）をワンクリックで実ディスクに反映（`arena:apply-patch`）できます。
2. **二元 Plan / Act 実行ゲートと書き込み前スナップショット。** 煩雑な 6 軸権限マトリクスを廃止し、`Plan`（読み取り専用の計画探索）と `Act`（作業スペース内の自動実行・中断なし）の 2 モードに集約。ファイル変更前に自動で軽量 Git ツリー/増分スナップショットを作成し、インライン差分カードとワンクリック `[Revert]` 復元を提供。危険な操作（ワークスペース外アクセス、認証情報変更、破壊的コマンド）のみ確認を求めます。
3. **プレフィックスキャッシュ安全な二層ツールルーティング。** 10 個の固定トップレベル Schema により、フェーズ切り替えによる API プロンプトキャッシュの破棄を完全に防止（キャッシュヒット率 ~100%）。サブエージェント専用ツールプールとセカンダリゲートウェイを活用。
4. **邪魔にならない不可視メモリ（AutoMemory）。** 独立した管理画面を廃止し、アシスタントヘッダーに `[Memory · X hits]` カプセルを表示。注入理由（Why Injected）を確認し、ワンクリックで削除や `AGENTS.md` へのピン留め（シンボリックリンク防御付き）が可能。再利用可能なワークフローはインラインで `SKILL.md` に蒸留。
5. **洗練された 3 本柱ナビゲーションと合一 HUD。** `Workspace`、`Arena`、`Settings` の 3 つの主要画面に整理。入力欄 HUD は `[Plan/Act]`、`[モデル]`、`[思考深度]`、`[トークン/費用と即時ロールバック]` の 4 コントロールに統一。軽量なターミナル TUI（`aether tui`）とヘッドレス CLI（`aether "task"`）および SDK は npm から提供されます。

---

## ダウンロードとクイックスタート

> **推奨エディション**: Aether の開発重心およびすべての主要機能（ビジュアル Arena、知識グラフ管理、インライン Diff レビュー）は **Windows デスクトップ版** に集約されています。通常の利用では **Windows デスクトップ版のダウンロードを強く推奨します**。

### デスクトップ版 (Windows · 推奨)

[GitHub Releases](https://github.com/TQSY114514/Aether/releases) から最新リリースをダウンロードしてください:

- **`aetherai-setup-x.y.z.exe`**（インストーラー、推奨、自動更新対応）
- **`aetherai-x.y.z.exe`**（ポータブル版、インストール不要）

> **Windows SmartScreen の警告について**: Aether は商用コード署名証明書を持たない個人開発者によって開発されています。Windows 11 / Defender で「Windows によって PC が保護されました」と表示された場合は、**詳細情報 → 実行** をクリックしてください。プロジェクトは 100% オープンソースです。

### ターミナル版 & CLI (Node.js ≥ 22)

```bash
# グローバルインストール
npm install -g aetherai

# インタラクティブターミナル UI の起動
aether tui

# ワンショットタスク
aether "テストスイートを実行して失敗したテストを修正" --model deepseek

# 自動化用のヘッドレス JSONL RPC
aether --mode rpc
```

### ソースコードから実行

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # 依存関係をインストールし、フロントエンドをビルドして Electron を起動
```

---

## コア機能

- **ワークスペース・ハブ (Workspace Hub)**: プロジェクトの一覧・即時切り替え、お気に入り（⭐）、エクスプローラーで表示、`cd` コマンドコピー、およびプロジェクトスコープによるセッション絞り込み。
- **マルチモデルアリーナ 2.0 (Arena)**: リアルタイム並行生成、Starter Benchmark スイート、タスク意図（コーディング/推論/翻訳）別の ELO ランキング、勝者コードパッチのワンクリック実ディスク反映（`arena:apply-patch`）。
- **プレフィックスキャッシュ安全な二層ツールルーティング**: 10 個の固定トップレベル Schema により、フェーズ切り替えによる API プロンプトキャッシュの破棄を完全に防止（キャッシュヒット率 ~100%）。
- **二元 Plan / Act 実行ゲートと書き込み前スナップショット**: `Plan`（読み取り専用・計画探索）と `Act`（作業スペース内自動実行・中断なし）の 2 モード。ファイル書き込み前の自動 Git ツリー/増分スナップショットとインライン差分カードによるワンクリック即時ロールバック。
- **5段階の適応型思考予算制御 (Thinking Depth)**: `minimal 1k` から `max 32k tokens` まで、モデルの推论深度を直観的にダイヤル調整（Claude 3.7 / DeepSeek R1 / Gemini 2.5 / OpenAI o-series 対応）。
- **Hashline ハッシュアンカー編集 (Hashline Edits)**: `patchEngine.js` による行内容ハッシュアンカー編集。複数ファイルや長文コンテキストでの同時編集時の行番号ドリフトとパッチ競合を根絶。
- **ターミナル TUI & リアルタイムストリーミング実行**: `aether tui`（Ink v5 駆動）によるターミナル対話インターフェース。ツール呼び出しブロック内で標準出力をリアルタイムストリーミング、即時中断に対応。
- **コンテキスト圧縮 (Compaction)**: ツール呼び出しのペアと重要な技術的決定を完全に保持した履歴の自動要約。
- **MCP エコシステム拡張**: プレフィックス名前空間衝突防止を備えた任意の Model Context Protocol stdio サーバーをシームレスに接続。
- **不可視 AutoMemory とスキル蒸留**: アシスタントヘッダーに埋め込まれた `[Memory · X hits]` カプセル、透明な注入理由 Popover、`AGENTS.md` へのピン留め（シンボリックリンク防御付き）、および `SKILL.md` へのインライン自動蒸留。
- **合一 HUD & 3 本柱ナビゲーション**: 入力欄 HUD（Plan/Act、モデル、思考深度、トークン/費用と即時ロールバック）と 3 つの主要ビュー（Workspace、Arena、Settings）。

---

## 謝辞 (Acknowledgements)

Aether の設計とコードベースは、以下のオープンソースプロジェクトやエンジニアリング実践から具体的な知見を得ています:

### Agent ランタイムとコーディングハーネス
- **[Claude Code](https://claude.ai/code) (Anthropic)** — カスケード型 `AGENTS.md` 探索（`projectInstructions.js`）、圧縮後の重要ファイル再水和（`compaction.js`）、検証デバッグループ（`debugAgent.js`）、10 点ライフサイクルフック（`hooks.js`）、6 軸権限ラダー（`trustEngine.js`）、`Ctrl+T` タスクパネル、`ask_user` 構造化プロンプト、およびインライン Diff プレビュー（`toolImpact.js`）。
- **[OpenAI Codex CLI](https://github.com/openai/codex)** — テストと Git Diff の証拠に基づく検証ループ（`toolLoop.js`）、カスケード型指示探索、TUI コンパクト実行タイマー、単一キー権限ショートカット（`y/s/a/n`）、およびチェックポイント巻き戻し（`rewind`）UX。
- **[pi (`pi-mono`)](https://github.com/badlogic/pi-mono) (Mario Zechner)** — `AgentMessage` UI・通信層分離抽象化（`agentMessage.js`）、統合イベントストリームテレメトリ（`agentEvents.js`）、実行中の動的ステアリング（`steering.js`）、および巨大出力の `$TMPDIR` ディスク退避と末尾プレビュー（`toolResultMiddleware.js`）。
- **[OpenCode](https://github.com/sst/opencode)** — ターミナル TUI キーボード状態マシンと Timed Leader Key（`keyHandlers.js`）、ウィンドウ化 `DialogSelect` リスト、コンパイル時プロンプトキャッシュポリシー（`cachePolicy.js`）、およびコンテキストバジェットマネージャー（`contextBudget.js`）。
- **[oh-my-pi (`omp`)](https://github.com/can1357/oh-my-pi) & [roboomp](https://github.com/roboomp)** — ターミナル AI コーディングハーネス、自動 Triage/PR ワークフロー、ハッシュアンカー編集（`patchEngine.js` の Hashline Edits）、LSP/DAP シンボル認識コードインテリジェンス、およびマルチ Worktree サブエージェントオーケストレーション。
- **[Aider](https://github.com/Aider-AI/aider)** — `<<<<<<< SEARCH ... >>>>>>> REPLACE` 耐障害パッチパーサー（`patchEngine.js`）、Git ワークフロー統合、およびコンテキスト圧縮ハンドオフ設計。
- **[ZCode](https://github.com/zai-org/ZCode) (Z.ai)** — 8 段階カスケードファジー編集マッチャー（`editMatchers.js`）、書き込み前の読み取りタイムスタンプ鮮度ガード（`sessionContext.js` `readFileState`）、バックグラウンドタスクの `branchGeneration` 分離と通知集約（`backgroundTasks.js`）、組み込みマルチ Agent ロールとワークフローテンプレート（`.aether/agents`、`.aether/workflows`）、および GitHub URL / `owner/repo` スキルインストーラー（`skills.js`）。
- **[Gemini CLI](https://github.com/google-gemini/gemini-cli) & [aichat](https://github.com/sigoden/aichat)** — トークンバジェット見積もり（`contextBudget.js`）、承認モード切り替え、および 50ms イベントストリームデバウンス集約（`runSession.js`）。
- **[Cline](https://github.com/cline/cline)、[Roo Code](https://github.com/RooVetGit/Roo-Code) & [Continue](https://github.com/continuedev/continue)** — ツール出力の折りたたみ・トリミング戦略（`compaction.js`）、可視化サブステップ追跡、および宣言的設定スキーマ（`.aether/config.json`）。
- **[Search](https://github.com/driceroland/Search) (`driceroland/Search`)** — マルチ粒度ローカルリポジトリ検索とコンテキスト認識コード検索パイプラインの設計着想（`registry.js`、`repoMap.js`）。

### コンテキスト・メモリ・安全機構
- **[OpenClaw](https://github.com/openclaw/openclaw)** — コンテキスト圧縮アルゴリズム（`compaction.js`）、不正なツール呼び出し自動修復（`toolCallRepair.js`）、読み取り専用ツールキャッシュ（`toolCache.js`）、意味的無限ループハッシュ検知（`toolResultHash.js`）、およびツール結果サニタイズミドルウェア（`toolResultMiddleware.js`）。
- **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** — 反復バジェット制御とグレースフル終了（`iterationBudget.js`）、SQLite + FTS5 長期メモリ（`autoMemory.js`）、エンティティ関係知識グラフ（`knowledgeGraph.js`）、対話軌跡圧縮（`trajectory.js`）、および長期スキル習得（`habitLearner.js`）。
- **[Wish](https://github.com/WindustH/wish-core) (WindustH)** — プロンプトキャッシュを保護するオンデマンド CLI ブリッジ、Windows Win32 Job Object によるカーネルレベルのプロセスツリー統治、および Fetch ベースの高耐障害性ストリーム状態マシン。
- **[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)** — ローカルゲートウェイのループバックバインドおよび HTTP Host ヘッダー検証による DNS Rebinding 防御（QVD-2026-57410 防御実践）とバッジ行の視覚規約。
- **[Open Math Harness](https://github.com/openmathmodel/open-math-harness) (SAIR Foundation)** — マイクロカーネルアーキテクチャ不変条件とヘッドレス隔離（`architecture.rs` の静的解析に着想を得た 5 重の `check-architecture.js` ゲート、および `database.js` の Electron 依存分離）。

### 評価・コードレビュー・マルチ Agent オーケストレーション
- **[Qwen Code](https://github.com/QwenLM/qwen-code) & [Qwen-Coder](https://github.com/QwenLM/Qwen3-Coder)** (Alibaba Cloud) — Agent Arena マルチモデル並行競合実行と Git Worktree 隔離実行（`/arena` に着想を得た `shadowGit.js` および `arena:apply-patch`）、`qwencoder-eval` 評価設計、および思考パラメータ適応（`reasoning.js` の `enable_thinking`）。
- **[LMSYS Chatbot Arena](https://chat.lmsys.org/) & [SWE-bench](https://www.swebench.com/)** — 組み込みローカルモデルアリーナ（`arena.handler.js`）、ブラインドペア ELO ランキングシステム、およびコーディング能力評価ハーネス。
- **[Paperclip](https://github.com/paperclipai/paperclip)** — Agent ランタイム制御プレーンガバナンス（`AgentSettings.tsx`）、ロール分離されたマルチ Agent 交差検証（`securityAudit.js` における `Hunter != Verifier`、`agentRoles.js`）、および計画ステップの自動進行（`planning.js`）。
- **[OpenHands](https://github.com/All-Hands-AI/OpenHands) (All-Hands AI)** — マルチバックエンド実行抽象化（`backend.js`、`dockerBackend.js`、`sshBackend.js`）と永続的なサブエージェントサンドボックスワークフロー。
- **[Jules](https://jules.google.com)** (Google Labs)、**[Grok Build](https://x.ai)**、**[Amp](https://ampcode.com)** & **[Devin Desktop (Windsurf)](https://windsurf.com)** — 非同期バックグラウンドコーディング Agent、特化型サブ Agent ロール定義（`agentRoles.js`）、長時間実行状態マシン（`longRunningTask.js`）、および実行タイムラインドロワーの設計着想。
- **[Kiro](https://aws.amazon.com/q/developer/)** — 適応型推論深度制御（`reasoning.js` / `EffortControl.tsx`）およびインラインサブエージェント実行ビジュアル（`SubagentDeck.tsx`）。
- **[DS4](https://gist.github.com/antirez) (Salvatore Sanfilippo)** & **[Evolver](https://github.com/EvoMap/evolver)** — 実行前の階層的タスク分解（`planning.js`）およびゲノム進化プロトコル (GEP) 戦略内省アーキテクチャ。
- **[CodeRabbit](https://coderabbit.ai) & [Greptile](https://greptile.com) ([`greptile-apps[bot]`](https://github.com/apps/greptile-apps))** — 自動 PR 行単位コードレビュー、AST 認識の高リスク API 遮断（`.coderabbit.yaml`）、およびリポジトリ全体のセマンティックグラフ回帰防御。

### コアインフラストラクチャと UI エコシステム
- **ランタイムとストレージ基盤**：[Electron](https://www.electronjs.org) · [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (Joshua Wise) · [Ink v5](https://github.com/vadimdemedes/ink) (Vadim Demedes) · [React](https://react.dev) · [Zustand](https://github.com/pmndrs/zustand) (Poimandres) · [Tailwind CSS](https://tailwindcss.com)。
- **コンポーネントとプロトコル設計**：[Model Context Protocol (MCP)](https://modelcontextprotocol.io) · [shadcn/ui](https://github.com/shadcn-ui/ui) · [Magic UI](https://github.com/magicuidesign/magicui) · [cc-switch](https://github.com/farion1231/cc-switch) · [new-api](https://github.com/QuantumNous/new-api)。

---

## コントリビューション

貢献を歓迎します！問題の発見やアイデアがあれば、Issue や Pull Request をお寄せください。

- **バグの報告**: [GitHub Issues](https://github.com/TQSY114514/Aether/issues/new) から送信してください。
- **コントリビューション**: 大きなアーキテクチャ変更を行う前に [CONTRIBUTING.md](./CONTRIBUTING.md) および [docs/roadmap.md](./docs/roadmap.md) をご確認ください。

---

## ライセンス

[MIT](./LICENSE) © 2025-2026 Aether
