<div align="center">

# AetherAI

**로컬 우선, 다중 모델 데스크톱 AI 채트 클라이언트 · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

AetherAI는 여러 LLM 프로바이더(OpenAI / Claude / DeepSeek / 로컬 모델 / 모든 OpenAI 호환 엔드포인트)를 하나의 데스크톱 앱으로 통합합니다. 모든 데이터는 로컬에 저장됩니다. 여러분의 API 키와 대화 내용은 사용자가 설정한 프로바이더를 제외하고는 절대 컴퓨터 밖으로 나가지 않습니다.

## ✨ 기능

- **다중 프로바이더 추상화** — 단일 어댑터 레이어. 새로운 프로바이더 형식을 추가하는 데 파일 하나면 충분합니다. 현재는 OpenAI 호환(OpenRouter, Together, DeepSeek, Ollama의 OpenAI 심, LM Studio 등을 포함)을 지원합니다.
- **동시 다중 세션 스트리밍** — 한 채트에서 스트리밍하는 동안 다른 채트에서도 계속 대화할 수 있습니다.
- **아레나(Arena)** — 하나의 프롬프트로 여러 모델이 동시에 답변합니다. 가장 마음에 드는 답변에 투표하면 ELO 리더보드가 자동으로 갱신됩니다.
- **페르소나(Personas)** — 시스템 프롬프트 프리셋을 세션별로 전환할 수 있습니다.
- **첨부파일** — 텍스트 파일은 컨텍스트로 주입되고, 이미지는 멀티모달로 전달됩니다(비전 모델 필요).
- **긴 붙여넣기 접기** — 수백 줄을 붙여넣으면 자동으로 펼칠 수 있는 스니펫으로 접힙니다(ChatGPT 방식).
- **에이전트(함수 호출)** — 13개의 내장 도구(`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`)와 Plan→Act→Observe 루프, 실시간 추론 트레이스를 제공합니다.
- **에이전트 권한 모드** — 끄기 / 확인(위험한 도구마다 승인) / 자동(모두 허용) / 계획(읽기 전용). 코딩 에이전트의 권한 모델과 동일합니다.
- **MCP 지원** — 외부 stdio MCP 서버를 연결하면 해당 도구들이 내장 도구와 자동으로 병합됩니다.
- **사고 강도 슬라이더** — 실제 파라미터에 반영됩니다. OpenAI o-시리즈 → `reasoning_effort`, Claude → `thinking.budget_tokens`.
- **사이드바 요약** — 제목은 모델이 생성한 주제 문구(예: "신규 영웅 천사 뽑기 조언")이며, 텍스트를 그대로 복사한 것이 아닙니다.
- **고급 설정** — 최대 토큰, temperature, top_p, 커스텀 시스템 프리픽스, 언어별 자동 제목.
- **커스텀 배경** — 이미지를 업로드하고 불투명도 / 블러를 조절할 수 있습니다.
- **15개 UI 언어** — English(표준 + 상하 반전), 中文(简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية(RTL), हिन्दी, 한국어.
- **테마** — 라이트 / 다크 / 블루 / 글래스 / 레트로.
- **로컬 저장** — 모든 데이터는 로컬 SQLite 데이터베이스에 저장되며, 어떤 것도 업로드되지 않습니다.

## 🚀 빠른 시작

### 사전 요구 사항
- Node.js 18+
- npm 9+

### 설치 및 실행
```bash
cd app
npm install
npm run dev      # 개발 (핫 리로드)
npm run build    # 프로덕션 프론트엔드 빌드
npm start        # Electron 실행
```

또는 Windows에서 저장소 루트의 `start.bat`을 실행하세요.

### 첫 번째 프로바이더 설정
1. 실행 후 사이드바에서 **Models**를 클릭합니다.
2. 프로바이더를 추가합니다(이름 / API URL / API Key).
3. **Fetch models**를 클릭하여 사용 가능한 모델 목록을 가져옵니다.
4. 채트로 돌아가 대화를 시작합니다.

## 📁 프로젝트 구조

```
app/
├── electron/              # 메인 프로세스 (Node)
│   ├── database.js        # SQLite (sql.js) 데이터 레이어
│   ├── ipc/               # IPC 핸들러 (chat / arena / session / mcp / ...)
│   ├── llm/               # LLM 추상화
│   │   ├── providerAdapter.js   # api_format 기반 디스패처
│   │   ├── openaiAdapter.js     # OpenAI 호환 구현
│   │   ├── reasoning.js         # 사고 강도 파라미터 빌더
│   │   ├── toolLoop.js          # 함수 호출 루프
│   │   └── toolArgs.js          # 도구 인자 파싱
│   ├── tools/             # 내장 도구 레지스트리
│   ├── mcp/               # MCP 클라이언트 + 매니저
│   ├── main.js / preload.js
├── src/                   # 렌더러 (React + TS)
│   ├── store/index.ts     # zustand 전역 상태
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15개 로케일) / theme / markdown
│   └── types/
└── package.json
```

## 🔒 프라이버시

**모든 데이터는 로컬에 저장됩니다.** AetherAI는 사용자에 대한 어떤 정보도 수집하거나 업로드하지 않습니다. API 키, 대화 내용, 페르소나는 모두 로컬 SQLite 데이터베이스에 보관됩니다. 외부로 나가는 네트워크 요청은 오직 사용자가 설정한 LLM 프로바이더뿐입니다.

> ⚠️ GitHub에 푸시하기 전에 `.gitignore`가 `*.db`, `dist/`, `node_modules/`, `background.img`, 그리고 모든 `.env`를 제외하는지 확인하세요.

## 📄 라이선스

MIT
