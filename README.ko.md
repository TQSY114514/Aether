<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### 로컬 우선, 다중 모델 데스크톱 AI 워크벤치

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **상태: Beta.** AetherAI는 개인/취미 프로젝트입니다. 작동하지만 거친 부분이 있을 수 있습니다. 버그 리포트를 환영합니다 — [CONTRIBUTING.md](./CONTRIBUTING.md) 및 [SECURITY.md](./SECURITY.md)를 참조하세요.

여러 LLM 프로바이더 — OpenAI / Claude / DeepSeek / 로컬 모델 / 모든 OpenAI 호환 엔드포인트 — 를 하나의 데스크톱 앱으로 통합합니다. 파일을 읽고 쓰고 명령을 실행하는 에이전트, 작업 공간 샌드박스, ELO 투표가 포함된 다중 모델 아레나, 스킬, 그리고 15개 UI 언어. 모든 데이터는 로컬에 저장됩니다: API 키와 대화 내용은 사용자가 설정한 프로바이더로 전송되는 것 외에는 절대 컴퓨터 밖으로 나가지 않습니다.

---

## AetherAI가 다른 점

AetherAI는 일반적으로 여러 도구에 분산되어 있는 여러 기능을 하나의 로컬 데스크톱 앱으로 결합합니다:

| 기능 | 설명 | 성숙도 |
|---|---|:---:|
| **다중 프로바이더 채팅** | 대화 중 OpenAI, Claude, DeepSeek 및 모든 OpenAI 호환 엔드포인트 간 전환. | `Stable` |
| **에이전트 도구 루프** | 16개 내장 도구, Plan-Act-Observe 루프, 샌드박스, 권한 사다리. | `Beta` |
| **다중 모델 아레나** | 하나의 프롬프트를 여러 모델에 보내고 가장 좋은 것에 투표, ELO 순위 추적. | `Beta` |
| **스킬 & 확장성** | `SKILL.md` 파일 추가, MCP 서버, 10단계 훅 시스템. | `Experimental` |
| **구조화된 메모리** | 에이전트가 세션 전반에 걸쳐 선호도와 과거 결정을 기억함. | `Beta` |
| **계층적 계획** | 복잡한 요청은 자동으로 병렬 하위 작업으로 분해됨. | `Experimental` |
| **컨텍스트 압축** | 긴 대화는 도구 호출 쌍을 잃지 않고 자동 요약됨. | `Beta` |
| **로컬 우선 프라이버시** | 대화, 키, 페르소나가 로컬 SQLite에 저장. 데이터가 기기를 나가지 않음. | `Stable` |
| **15개 UI 언어** | 고전 중국어(文言)와 RTL 아랍어 포함. | `Beta` |
| **MIT 라이선스** | 완전한 오픈 소스. | `Stable` |

---

## 다운로드

### Windows — 사전 빌드된 설치 파일 (대부분의 사용자에게 권장)

최신 [릴리즈](https://github.com/TQSY114514/Aether/releases)에서 다운로드:

| 빌드 | 설명 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS 설치 파일. 사용자별 (관리자 권한 불필요), 앱 내 자동 업데이트. **권장.** |
| **`AetherAI-x.y.z.exe`** | 포터블 단일 실행 파일. 설치 없음, 자동 업데이트 없음; 실행만 하면 됨. |

> 설치 파일은 첫 실행 시 SmartScreen "알 수 없는 출판사" 경고를 표시합니다 — 서명되지 않은 개인 앱이므로 예상된 동작입니다. 모든 데이터는 로컬에 유지됩니다.
>
> ⚠️ 앱이 서명되지 않았기 때문에 일부 백신 소프트웨어가 패키징 중 압축 해제된 `electron.exe`를 격리할 수 있습니다. 설치 파일이 백신에 의해 제거된 경우 제외 항목을 추가하거나 포터블 빌드를 사용하세요.

### 소스에서 실행 (개발자 / 파워 유저)

소스에서 실행하거나 코드를 수정하려는 경우 `start.bat`을 사용하세요 ([Node.js 18+](https://nodejs.org) 필요):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: 의존성 설치, 프론트엔드 빌드, Electron 실행
```

수동 단계별 가이드는 [빠른 시작](#-quick-start)을 참조하세요.

> **exe vs start.bat** — 두 가지 모두 지원되며 각각 다른 사용자층을 대상으로 합니다:
> - **설치 파일 exe** — 최종 사용자용: 더블클릭으로 설치, 시작 메뉴 항목, 앱 내 자동 업데이트, Node.js 불필요.
> - **start.bat** — 개발자 / 테커용: 투명한 `npm install` → `vite build` → `electron .` 파이프라인, 수정 후 실행, Node.js 필요.

---

## 빠른 시작

**사전 요구 사항:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # 개발 (핫 리로드)
npm run build    # 프로덕션 프론트엔드 빌드
npm start        # Electron 실행
```

또는 Windows에서 리포지토리 루트에서 `start.bat`을 실행하세요.

### 프로바이더 설정

1. 실행 후 사이드바에서 **Models**를 클릭합니다.
2. 프로바이더 추가 (이름 / API URL / API Key).
3. **Fetch models**를 클릭하여 사용 가능한 모델 목록을 가져옵니다.
4. 채트로 돌아가 대화를 시작합니다.

### Ask 모드 활성화

1. **Settings - Agent & Safety**를 엽니다.
2. 에이전트 권한 모드를 **Ask**로 설정합니다.
3. 작업 공간 루트가 에이전트가 읽고 쓸 폴더인지 확인합니다.
4. 제한 없는 접근을 원하지 않으면 **Yolo**는 비활성화 상태로 두세요.

### 첫 에이전트 작업 실행

1. 새 채트를 엽니다.
2. 다음을 입력하세요: `List the files in this project and summarize what the app does.`
3. 제안된 각 도구 호출을 검토합니다. 안전한 읽기는 승인; 예상치 못한 것은 거부.
4. 실시간 추론 트레이스와 최종 답변을 확인하세요.

---

## 기능

**상태 레이블:** `Stable` = 일상 사용 준비됨, `Beta` = 알려진 거친 부분이 있지만 사용 가능, `Experimental` = 새로운/고급 동작은 변경될 수 있음, `Planned` = 문서화된 로드맵 항목.

### 채팅

| 기능 | 상태 | 설명 |
|---|:---:|---|
| **다중 프로바이더** | `Stable` | 단일 어댑터 레이어; 프로바이더 추가 = 파일 하나만 추가. OpenRouter, Together, DeepSeek, Ollama, LM Studio 등 포함. |
| **동시 스트리밍** | `Stable` | 한 채트에서 스트리밍하는 동안 다른 채트에서 계속 대화 가능. |
| **사고 강도 슬라이더** | `Beta` | 실제 파라미터: OpenAI o-시리즈 / gpt-5 / Claude 리레이 통해. 추론 모델에서만 유효. |
| **첨부파일** | `Beta` | 텍스트 파일은 컨텍스트로; 이미지는 멀티모달에 (비전 모델 필요). |
| **긴 붙여넣기 접기** | `Stable` | 수백 줄은 자동으로 펼칠 수 있는 스니펫으로 접힘 (ChatGPT 방식). |
| **메시지 수정** | `Stable` | 어느 지점에서든 덮어쓰기 + 재생성. |
| **메시지 검색** | `Stable` | 전체 메시지 하이라이트 포함. |
| **사이드바 요약** | `Beta` | 복사된 텍스트가 아닌 모델 생성 주제 문구. |

### 에이전트 (함수 호출)

- `Beta` **16개 내장 도구** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`)와 Plan-Act-Observe 루프, 실시간 추론 트레이스 + 작업 체크리스트, 루프 감지, 도구별 타임아웃, 구성 가능한 반복 예산(기본 25 라운드), 컨텍스트 압축.
- `Experimental` **계층적 계획** — 복잡한 요청에 대한 작업 분해 자동 생성 (DS4 영감).
- `Experimental` **하위 에이전트 위임** — 독립 하위 작업은 `delegate_task`를 통해 병렬로 실행.
- `Stable` **권한 모드** — 위험도 상승 사다리:

| 모드 | 설명 | 샌드박스 |
|---|---|:---:|
| **Off** | 일반 채트, 도구 없음 | N/A |
| **Plan** | 읽기 전용 도구 (변경 없이 조사) | - |
| **Ask** | 각 위험 작업 확인 (권장) | - |
| **Auto** | 모든 작업 확인 없이 실행 | 예 |
| **Yolo** | 전체 권한, 샌드박스 없음 | 아니요 |

- `Stable` **작업 공간 샌드박스** — `write_file`/`edit_file`은 구성된 작업 공간 루트 외부에서 거부됨; `run_command`는 파괴적 패턴을 차단함. Settings - Agent & Safety에서 구성 가능.
- `Beta` **컨텍스트 압축** — 오래된 기록 자동 요약 (도구 호출/결과 쌍은 유지; 식별자는 원본 그대로 보존).
- `Beta` **도구 호출 복구** — 잘못된 JSON, 누락된 인수, 따옴표 없는 키, 잘린 호출 자동 복구.

### 메모리 & 학습

- `Beta` **자동 장기 메모리** — 매 턴 전에 관련 메모리 주입; 주요 사실 자동 추출 및 저장. Settings - Agent에서 토글 가능.
- `Experimental` **습관 학습자** — 반복적 선호도 감지 (예: "항상 Claude 사용") 및 자동 적용 스킬 제안.
- `Beta` **감사 로그** — 디버깅용 매 턴 에이전트 실행 트레이스.

### 아레나

- `Beta` **다중 모델 아레나** — 하나의 프롬프트, 여러 모델이 **동시**로 답변; 가장 좋은 것에 **투표**하면 **ELO 리더보드**가 자동으로 업데이트됨. 모델은 **의도별** (코딩 / 수학 / 번역 / 요약 / 일반)로 평가됨. *빌트인 다중 모델 아레나와 ELO를 제공하는 다른 로컬 우선 데스크톱 채트 앱은 없습니다.*

### 스킬 & 확장성

| 구성 요소 | 형식 | 상태 | 세부사항 |
|---|---|:---:|---|
| **스킬** | `SKILL.md` | `Experimental` | `<workspace>/.claude/skills/`에 추가; `release-checklist` 및 `git-commit` 포함 |
| **슬래시 명령** | `CMD.md` | `Stable` | 6개 내장: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **훅** | 스크립트 | `Experimental` | 10개 수명 주기 지점: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | 외부 MCP 서버는 내장 도구와 자동으로 병합됨 |

### 사용자 정의

| 설정 | 상태 | 설명 |
|---|:---:|---|
| **고급 모델 설정** | `Stable` | 최대 토큰, temperature, top_p, 커스텀 시스템 프리픽스, 언어별 자동 제목, 사고 강도 |
| **커스텀 배경** | `Stable` | 불투명도 / 블러 제어 기능으로 이미지 업로드 |
| **페르소나** | `Stable` | 시스템 프롬프트 프리셋, 세션별로 전환 가능 |
| **테마** | `Stable` | 라이트 / 다크 / 블루 / 글래스 / 레트로 |
| **15개 UI 언어** | `Beta` | 영어, 중국어 (간체/번체/고전), 일본어, 스페인어, 프랑스어, 독일어, 포르투갈어, 러시아어, 우크라이나어, 아랍어(RTL), 힌디어, 한국어 |
| **자동 업데이트** | `Beta` | NSIS 설치 파일이 실행 시 확인; 포터블도 확인 (수동 설치) |
| **사용량 추적** | `Beta` | API 호출별 로그: 토큰, 비용, 지연시간, 캐시 히트율 |

### 프라이버시

> **모든 데이터는 로컬에 유지됩니다.** AetherAI는 사용자와 관련된 데이터를 수집하거나 업로드하지 않습니다. API 키, 대화, 페르소나는 로컬 SQLite 데이터베이스에 저장됩니다. 외부 네트워크 요청은 구성한 LLM 프로바이더로만 전송됩니다.

---

## 프로젝트 구조

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

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 데스크톱 | Electron 31 |
| 프론트엔드 | React 18.3 + TypeScript 5.5 |
| 상태 관리 | Zustand 4.5 |
| 빌드 | Vite 5.4 + electron-builder |
| 데이터베이스 | sql.js (메모리 내 SQLite, 디스크에 저장) |
| LLM | OpenAI 호환 + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | 커스텀 stdio JSON-RPC 2.0 클라이언트 |

---

## 감사의 말

AetherAI는 다음 프로젝트들 위에 세워졌습니다 — 그들의 아이디어가 아키텍처와 UX에 영향을 주었습니다:

### 에이전트 프레임워크

| 프로젝트 | 영감 |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | 에이전트 권한 모델, 사고 슬라이더, 도구 호출 시각화, 하위 에이전트 위임, 훅 |
| [OpenClaw](https://github.com/openclaw/openclaw) | 컨텍스트 압축, 도구 호출 루프 감지, 이벤트 스트림 아키텍처 |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | 반복 예산, 구조화된 장기 메모리, 자율 스킬 |
| [OpenAI Codex](https://github.com/openai/codex) | 샌드박싱, 컨텍스트 압축, 도구 호출 복구 |
| [DS4](https://github.com/antirez/ds4) | 계층적 작업 분해 |

### UI & UX

| 프로젝트 | 영감 |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva 복사-붙여넣기 컴포넌트 방법론 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 애니메이션 패턴 (shimmer, blur-fade) |

### 인프라

| 프로젝트 | 영감 |
|---|---|
| [Dify](https://github.com/langgenius/dify) | 다중 형식 프로바이더 정규화 |
| [MCP](https://modelcontextprotocol.io) | AetherAI 에이전트가 사용하는 스펙 |
| [cc-switch](https://github.com/farion1231/cc-switch) | 사용량 통계 대시보드 레이아웃 |
| [new-api](https://github.com/QuantumNous/new-api) | 추론 강도 리레이, 사용량/비용 추적 |
| [Continue](https://github.com/continuedev/continue) | 설정을 소스로, 프로바이더 추상화 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | 다중 턴 에이전트 실행, 샌드박스 도구 실행 |
| [Aider](https://github.com/Aider-AI/aider) | LLM 코딩 어시스턴트 도구 루프, git 통합 |
| [Cline](https://github.com/cline/cline) | IDE 내장 에이전트, MCP 통합, 권한 UX |

---

## 기여

모든 기여를 환영합니다! 버그 수정, 기능 요청, 번역 개선, 문서 업데이트 등 — 이슈를 열거나 PR을 제출해 주세요.

1. 리포지토리 포크
2. 기능 브랜치 생성 (`git checkout -b feat/my-feature`)
3. 변경 사항 커밋 (`git commit -am 'Add feature'`)
4. 브랜치에 푸시 (`git push origin feat/my-feature`)
5. 풀 리퀘스트 열기

자세한 가이드는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참조하세요.

---

## 라이선스

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Electron + React + TypeScript로 ❤️로 만듦

[⬆ 맨 위로](#aetherai)

</div>
