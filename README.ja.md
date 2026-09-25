<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/readme-hero-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="./assets/readme-hero-light.png" />
  <img src="./assets/readme-hero.png" width="620" alt="Aether — Local-first Multi-Model AI Workbench" />
</picture>

# Aether

### ローカルファースト Agent ワークベンチ · 内蔵アリーナ · デフォルトで安全

実際のタスクで複数のモデルを並行比較し、実測データに基づいて最適なモデルを選定。デスクトップ GUI とターミナル TUI は同一のローカル SQLite データベース、長期記憶グラフ、権限サンドボックスを共有します。

[![release](https://img.shields.io/github/v/release/TQSY114514/Aether.svg?style=flat-square&color=8250df&labelColor=161b22&label=release)](https://github.com/TQSY114514/Aether/releases)
[![downloads](https://img.shields.io/github/downloads/TQSY114514/Aether/total?style=flat-square&color=3fb950&labelColor=161b22&logo=github&logoColor=white&label=downloads)](https://github.com/TQSY114514/Aether/releases)
[![npm downloads](https://img.shields.io/npm/dt/aetherai.svg?style=flat-square&color=3fb950&labelColor=161b22&logo=npm&logoColor=white&label=downloads)](https://www.npmjs.com/package/aetherai)
[![npm](https://img.shields.io/npm/v/aetherai.svg?style=flat-square&color=cb3837&labelColor=161b22&logo=npm&logoColor=white)](https://www.npmjs.com/package/aetherai)
[![ci](https://img.shields.io/github/actions/workflow/status/TQSY114514/Aether/ci.yml?branch=master&event=push&style=flat-square&label=ci&labelColor=161b22&logo=githubactions&logoColor=white)](https://github.com/TQSY114514/Aether/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-8b949e?style=flat-square&labelColor=161b22&label=license)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square&labelColor=161b22&logo=windows&logoColor=white)](#デスクトップ版-windows--推奨)

[English](./README.md) · [简体中文](./README.zh-CN.md) · **[日本語](./README.ja.md)** · [競合分析](./docs/competitive-analysis.md)

</div>

---

## 60 秒でわかる Aether

市販の多くの AI コーディングツールは単一のモデルを選択して盲信することを求めます。Aether はモデルをプラグイン可能なコンピュートエンジンとして扱い、コントロール権を常にあなたへ提供します:

1. **実際のタスクで実測（Arena）。** 内蔵の**アリーナ (Arena)** を開き、1つのプロンプトを複数のモデルに並行して送信し、最良の回答に投票。タスク種別（コーディング、推論、翻訳）ごとにローカル ELO レーティングがリアルタイムに更新されます。
2. **6軸権限ゲートによる安全な委託。** **Ask（問い合わせ）モード** で Aether をプロジェクトに向けます。提案されたファイル変更はインライン差分（Diff）として表示され、リスクのあるコマンドは実行前に承認を求めます。
3. **構造化長期記憶（AutoMemory & Knowledge Graph）。** API キー、チャット履歴、知識グラフはすべてローカルの SQLite データベース（`%APPDATA%/aetherai/aetherai.db`）に保存され、ワークスペース単位で分離されます。
4. **デスクトップ中心・ターミナル連携。** **開発の主軸は Windows デスクトップ版 (GUI)** に置かれており、ビジュアルなモデルアリーナ、記憶グラフ管理、Diff レビューの全機能を提供します。軽量なターミナル版（`aether tui`）は同じ SQLite ストアを共有する補助インターフェースとして機能します。

---

## 2 つのインターフェース、1 つの統合ランタイム

- 🖥️ **Aether Desktop (GUI · 主力エディション)** — Electron + React によるワークベンチ。リッチな Markdown ストリーミング、ビジュアルなモデルアリーナ、知識グラフ管理、リアルタイム推論トレース、設定センターをすべて搭載しています。
- ⌨️ **Aether Terminal (TUI / CLI / SDK · 補助ツール)** — Node.js 22+ と Ink v5 によるインタラクティブターミナル（`aether tui`）。キーボード操作、行番号付き Diff 承認、ヘッドレス CI モード（`--mode json|rpc`）、Electron-free SDK（`require('aetherai/sdk')`）を搭載。

> 💡 **シームレスな継続性**: デスクトップアプリで開始したセッションを、ターミナルで `aether tui --session <id>` を使ってそのまま再開できます（その逆も同様）。

---

## 誠実な自己評価レーダー

公開ベンチマークと再現可能な評価スクリプト（`node app/scripts/gen-radar.cjs`）に基づき、20 の主要 Agent（Claude Code, Codex, Cursor, Windsurf, Trae, Devin, OpenHands など）に対する客観的自己評価スコア:

<p align="center">
  <img src="./assets/agent-radar-2026.ja.svg" width="88%" alt="Aether 主要エージェント20種との誠実な自己評価レーダーチャート" />
</p>

Aether の客観的な優位性は **ローカルファーストのプライバシー (`9.4/10`)、マルチモデル・ブラインド Arena (`9.2/10`)、および権限安全ゲート (`8.4/10`)** にあります。一方で、単一モデルの純粋なコーディング能力（`6.8/10`、AST リポジトリインデックスや独自 Fast-Apply モデルの未搭載）やエコシステム成熟度（`6.5/10`、個人開発段階）においては、Claude Code や Cursor などの大規模商用ツールとの客観的な差を率直に認めています（詳細な減点根拠は [docs/competitive-analysis.md](./docs/competitive-analysis.md) を参照）。

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

- **マルチモデルアリーナ (Arena)**: リアルタイム並行生成と、タスク意図（コーディング/推論/翻訳）別の ELO ランキング。
- **権限安全ラダー**: ホワイトリストコマンドサンドボックスと機密パス保護を備えたきめ細かな機能制御（`Plan` → `Ask` → `Auto` → `Yolo`）。
- **ターミナルリアルタイムストリーミング実行**: Claude Code スタイルの体験に合わせ、ツール呼び出しブロック内で標準出力をリアルタイムストリーミング、即時中断に対応。
- **コンテキスト圧縮 (Compaction)**: ツール呼び出しのペアと重要な技術的決定を完全に保持した履歴の自動要約。
- **MCP エコシステム拡張**: プレフィックス名前空間衝突防止を備えた任意の Model Context Protocol stdio サーバーをシームレスに接続。
- **構造化プロジェクトメモリ**: SQLite + FTS5 全文検索に基づく、セッションを跨いだプロジェクト事実とアーキテクチャ決定の永続化。

---

## 謝辞 (Acknowledgements)

Aether の設計とコードベースは、以下のオープンソースプロジェクトやエンジニアリング実践から具体的な知見を得ています:

### Agent フレームワークとランタイム設計

- [Claude Code](https://claude.ai/code) (Anthropic) — 検証デバッグループ（`debugAgent.js`）、10 点ライフサイクルフック（`hooks.js`）、6 軸権限ラダー（`trustEngine.js`）、ターミナルストリーミング実行、および Ask/Plan/Auto/Yolo モードパラダイム。
- [pi](https://github.com/badlogic/pi-mono) (Mario Zechner) — `AgentMessage` 二重表現抽象化（`agentMessage.js`）、統合イベントストリームテレメトリ（`eventStream.js`）、実行中の動的割り込み（`agent.steer()`）、およびチェックポイント巻き戻し（`rollback.js`）。
- [ZCode](https://github.com/Au-Zone/zcode) — ゼロ LLM コストのローカルマイクロ圧縮とプロンプトキャッシュ安定ブロック順序（`microcompact.js`）、バックグラウンドタスクのブランチ世代分離と通知集約（`backgroundTasks.js`）、および多段階編集フォールバックマッチャー（`editMatchers.js`）。
- [OpenClaw](https://github.com/openclaw/openclaw) — コンテキスト圧縮アルゴリズム、ツール呼び出し無限ループ検知、イベントストリームオーケストレーション、およびツール結果サニタイズミドルウェア（`toolResultMiddleware.js`）。
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — 反復バジェット制御（`iterationBudget.js`）、スキル自動合成ループ（`skillSynthesis.js`）、および `<untrusted_memory>` 注入ラッパーを備えた構造化 SQLite + FTS5 メモリ。
- [Cline](https://github.com/cline/cline) & [Roo Code](https://github.com/RooVetGit/Roo-Code) — ツール出力のコンテキスト折りたたみ・トリミング戦略（`compaction.js`）および可視化サブステップ追跡。
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) & [aichat](https://github.com/sigoden/aichat) — トークン見積もりと承認モード切り替え（`contextBudget.js`）、および TUI の 50ms イベントストリームデバウンス集約（`runSession.js`）。
- [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) — QVD-2026-57410 ループバックバインドおよび HTTP Host ヘッダー検証による DNS Rebinding 防御（`gatewayServer.js`）。
- [Evolver](https://github.com/EvoMap/evolver) — ゲノム進化プロトコル (GEP) 自己内省アーキテクチャ（`gep.js`）。
- [Aider](https://github.com/Aider-AI/aider) — Search/Replace 編集ブロックフォールバックと Git ワークフロー統合。
- [OpenCode](https://github.com/sst/opencode) — TUI キーボードナビゲーション、パーミッションゲート UX、プロンプトキャッシュポリシー。
- [OpenAI Codex](https://github.com/openai/codex) — プロセスツリー分離と証拠ベースの自動検証コンセプト（`verifyLoop.js`）。
- [Amp](https://ampcode.com) & [Devin Desktop (Windsurf)](https://windsurf.com) — `AgentRunTimeline` 実行タイムラインドロワーと実行中の動的ステアリング UX。
- [DS4](https://gist.github.com/antirez) (Salvatore Sanfilippo) — 実行前の階層的タスク分解と計画設計。
- [Continue](https://github.com/continuedev/continue) — 宣言的設定スキーマ（"config is code"）。
- [Grok Build](https://x.ai) — 特化型 Agent ロールと長時間実行パターン。

### コアインフラストラクチャ、UI およびプロトコル

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (Joshua Wise) — 単一ファイル WAL ストレージ、FTS5 全文検索、`kg_nodes`/`kg_edges` グラフメモリを支える高速同期 SQLite ドライバー。
- [Ink v5](https://github.com/vadimdemedes/ink) (Vadim Demedes) — `aether tui` ターミナルインターフェースの React レンダリングエンジン。
- [Zustand](https://github.com/pmndrs/zustand) (Poimandres) — レンダラー状態管理とマルチモデル並行ストリーム調整。
- [Electron](https://www.electronjs.org) · [React](https://react.dev) · [Tailwind CSS](https://tailwindcss.com) — デスクトップクロスプラットフォームランタイムと UI 基盤。
- [shadcn/ui](https://github.com/shadcn-ui/ui) & [Magic UI](https://github.com/magicuidesign/magicui) — コンポーネント設計手法と軽量 CSS アニメーション。
- [cc-switch](https://github.com/farion1231/cc-switch) — 利用統計・コストダッシュボードのレイアウトインスピレーション。
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io) — 標準化されたツール統合プロトコル。
- [new-api](https://github.com/QuantumNous/new-api) — 推論エフォートパラメータマッピングとマルチプロバイダーリレー形式変換。

---

## コントリビューション

貢献を歓迎します！問題の発見やアイデアがあれば、Issue や Pull Request をお寄せください。

- **バグの報告**: [GitHub Issues](https://github.com/TQSY114514/Aether/issues/new) から送信してください。
- **コントリビューション**: 大きなアーキテクチャ変更を行う前に [CONTRIBUTING.md](./CONTRIBUTING.md) および [docs/roadmap.md](./docs/roadmap.md) をご確認ください。

---

## ライセンス

[Apache-2.0](./LICENSE) © 2025-2026 Aether
