<div align="center">

# AetherAI

**ローカルファーストのマルチモデル デスクトップ AI チャットクライアント · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

AetherAI は、複数の LLM プロバイダ（OpenAI / Claude / DeepSeek / ローカルモデル / OpenAI 互換の任意のエンドポイント）を一つのデスクトップアプリに統合します。すべてのデータはローカルに保存されます。API キーや会話履歴は、あなたが設定したプロバイダ以外の外部に送信されることはありません。

## ✨ 主な機能

- **プロバイダ抽象化** — 単一のアダプタレイヤーを採用。プロバイダのフォーマットを追加する際はファイル一つで済みます。現在は OpenAI 互換に対応（OpenRouter、Together、DeepSeek、Ollama の OpenAI シム、LM Studio などを網羅）。
- **マルチセッションの並列ストリーミング** — あるチャットでストリーミングしながら、別のチャットで会話を続けられます。
- **Arena** — 一つのプロンプトに対し複数のモデルが同時に回答。最も良いものに投票すると、ELO リーダーボードが自動的に更新されます。
- **ペルソナ** — システムプロンプトのプリセット。セッションごとに切り替え可能。
- **添付ファイル** — テキストファイルはコンテキストとして注入され、画像はマルチモーダル入力として扱われます（ビジョンモデルが必要）。
- **長文ペーストの折りたたみ** — 何百行ものテキストを貼り付けると、展開可能なスニペットに自動的に折りたたまれます（ChatGPT 風）。
- **エージェント（関数呼び出し）** — 13 個の組み込みツール（`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`）を備え、Plan→Act→Observe のループとリアルタイムの推論トレースを表示します。
- **エージェントの権限モード** — Off / Ask（リスクのあるツールを都度確認）/ Auto（すべて許可）/ Plan（読み取り専用）。コーディングエージェントの権限モデルを踏襲しています。
- **MCP サポート** — 外部の stdio MCP サーバーに接続。そのツールは組み込みツールに自動的に統合されます。
- **思考強度スライダー** — 実際のパラメータに連動。OpenAI o シリーズ → `reasoning_effort`、Claude → `thinking.budget_tokens`。
- **サイドバー要約** — タイトルはモデルが生成した話題のフレーズ（例：「新英雄天使 引き advice」）であり、テキストの単なるコピーではありません。
- **詳細設定** — max tokens、temperature、top_p、カスタムシステムプレフィックス、言語ごとの自動タイトル生成。
- **カスタム背景** — 画像をアップロードし、不透明度 / ぼかしを調整できます。
- **15 種類の UI 言語** — English（標準 + 逆さま）、中文（简体/繁體/文言）、日本語、español、français、Deutsch、português、русский、українська、العربية（RTL）、हिन्दी、한국어。
- **テーマ** — Light / Dark / Blue / Glass / Retro。
- **ローカルストレージ** — すべてのデータはローカルの SQLite データベースに保存され、何もアップロードされません。

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
│   │   ├── toolLoop.js          # 関数呼び出しループ
│   │   └── toolArgs.js          # ツール引数のパース
│   ├── tools/             # 組み込みツールのレジストリ
│   ├── mcp/               # MCP クライアント + マネージャー
│   ├── main.js / preload.js
├── src/                   # レンダラ（React + TS）
│   ├── store/index.ts     # zustand グローバル状態
│   ├── components/        # UI（chat / sidebar / settings / ui）
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n（15 ロケール）/ theme / markdown
│   └── types/
└── package.json
```

## 🔒 プライバシー

**すべてのデータはローカルに保存されます。** AetherAI は個人に関する情報を一切収集・アップロードしません。API キー、会話履歴、ペルソナはローカルの SQLite データベースに保持されます。外部へのネットワーク通信は、あなたが設定した LLM プロバイダへのリクエストのみです。

> ⚠️ GitHub にプッシュする前に、`.gitignore` で `*.db`、`dist/`、`node_modules/`、`background.img`、および `.env` ファイルが除外されていることを確認してください。

## 📄 ライセンス

MIT
