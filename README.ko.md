<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="Aether" />

# Aether

### 로컬 우선 · 멀티 모델 · 에이전트 네이티브

어떤 모델이든 채팅하고, 안전한 코딩 에이전트를 실행하며, 모델을 나란히 비교하세요 — 데스크톱 또는 터미널에서.

**Electron + Node.js · React + TypeScript · MCP · Agent · Skills**

[![GitHub downloads](https://img.shields.io/github/downloads/TQSY114514/Aether/total?style=flat-square&label=downloads)](https://github.com/TQSY114514/Aether/releases) [![npm downloads](https://img.shields.io/npm/dm/aetherai?style=flat-square&label=npm%20downloads)](https://www.npmjs.com/package/aetherai)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download)


[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>번역은 영어 / 간체 중국어 버전보다 늦을 수 있습니다.</sup>

</div>

---

> **상태: Beta.** Aether는 솔로/취미 프로젝트입니다. 동작은 하지만 거친
> 부분이 있을 수 있습니다. 버그 리포트는 환영합니다 — [CONTRIBUTING.md](./CONTRIBUTING.md) 및
> [SECURITY.md](./SECURITY.md)를 참조하세요.

> [!CAUTION]
> **Windows SmartScreen 경고는 정상입니다.** Aether는 상용 코드 서명 인증서 없이 학생 개발자가 만든 앱이므로, Windows 11 / Defender가 첫 실행 시 "내 PC 보호" 화면을 표시할 수 있습니다.
> **앱은 안전한 오픈소스입니다 — 코드를 검토한 후 "추가 정보 → 실행"을 클릭하세요.**
> 백신이 격리했다면 앱 폴더를 제외 목록에 추가하세요(자세한 내용은 [다운로드](#다운로드) 참조). 구성한 LLM 공급자 외에는 어떤 데이터도 PC를 떠나지 않습니다.

**플랫폼: Windows 전용.** 공식 빌드, 테스트, 지원은 Windows를 대상으로 합니다. macOS / Linux는 소스에서 빌드할 수 있지만 공식적으로 지원되지 않으며, 코드 서명도 계획되어 있지 않습니다 — 첫 실행 시 SmartScreen "알 수 없는 게시자" 프롬프트가 예상됩니다([다운로드](#다운로드) 참조).

**모든 모델을 위한 하나의 앱.** OpenAI / Claude / DeepSeek / 로컬 모델 / 모든 OpenAI 호환 엔드포인트 — 채팅, 코딩 에이전트 실행, ELO 투표가 있는 멀티 모델 아레나에서 모델을 맞대결로 비교하세요.

**설계상 로컬 우선(Local-first).** API 키와 대화는 로컬 SQLite 데이터베이스에 저장되며, 귀하가 구성한 프로바이더 외에는 절대 머신을 벗어나지 않습니다.

**기본적으로 안전.** 내장 에이전트는 권한 사다리가 있는 작업공간 샌드박스 안에서 실행됩니다: 파일 및 명령 액세스는 실행 전에 확인되며, 모든 도구 호출은 감사 가능합니다.

---

## Aether의 차별점

Aether는 일반적으로 여러 도구에 분산되어 있는 기능들을 하나의 로컬 데스크톱 앱에 결합합니다:

| 기능 | 설명 | 성숙도 |
|---|---|:---:|
| **멀티 프로바이더 채팅** | 대화 중 OpenAI, Claude, DeepSeek 및 모든 OpenAI 호환 엔드포인트를 전환할 수 있습니다. | `Stable` |
| **에이전트 도구 루프** | Plan-Act-Observe 루프, 샌드박싱, 권한 사다리를 갖춘 42개 내장 도구. | `Beta` |
| **멀티 모델 아레나** | 하나의 프롬프트를 여러 모델에 보내고 최고를 투표하며 ELO 순위를 추적합니다. | `Beta` |
| **스킬 & 확장성** | `SKILL.md` 파일을 바로 넣기, MCP 서버, 10포인트 후크 시스템. | `Experimental` |
| **구조화된 메모리** | 에이전트가 세션 전반에 걸쳐 선호도와 과거 결정을 기억합니다. | `Beta` |
| **계층적 플래닝** | 복잡한 요청을 병렬 하위 작업으로 자동 분해합니다. | `Experimental` |
| **컨텍스트 압축** | 도구 호출 쌍을 잃지 않으면서 긴 대화를 자동 요약합니다. | `Beta` |
| **로컬 우선 프라이버시** | 대화, 키, 페르소나가 로컬 SQLite에 저장됩니다. 어떤 것도 머신을 벗어나지 않습니다. | `Stable` |
| **15개 UI 언어** | 문언 중국어(고전 중국어) 및 RTL 아랍어 포함. | `Beta` |
| **터미널 TUI** | Ink v5 인터랙티브 터미널: 세션 스트림, 도구 카드, diff 검토/롤백, 키보드 권한 게이트, `/fork` 세션 트리, `/memory`, todo 패널, `@` 파일 참조, `!` 셸, 실행 중 steering, 세션 resume. | `Experimental` |
| **Headless CLI · RPC · SDK** | 4모드 CLI(단발 / NDJSON / JSONL RPC / 파이프), Electron-free SDK(`aetherai/sdk`), 머신 호출 가능한 JSONL 프로토콜. | `Experimental` |
| **MIT 라이선스** | 완전한 오픈소스. | `Stable` |

---

## 다운로드

> **하나를 선택하세요.** 두 제품은 동일한 에이전트 런타임과 세션 저장소를 공유합니다.
> - **데스크톱 채팅 앱만 원하시나요?** → [Aether Desktop](#다운로드-데스크톱)
> - **터미널 에이전트 / CI / SDK를 원하시나요?** → [Aether CLI](#다운로드-cli--tui--sdk)

### 다운로드 — 데스크톱

**Windows — 사전 빌드 설치 프로그램(대부분의 사용자에게 권장)**

최신 [릴리스](https://github.com/TQSY114514/Aether/releases)를 다운로드하세요:

| 빌드 | 설명 |
|---|---|
| **`aetherai-setup-x.y.z.exe`** | NSIS 설치 프로그램. 사용자별(관리자 불필요), 앱 내 자동 업데이트. **권장.** |
| **`aetherai-x.y.z.exe`** | 포터블 단일 exe. 설치 불필요, 자동 업데이트 없음; 그냥 실행하세요. |

> 설치 프로그램은 첫 실행 시 SmartScreen "알 수 없는 게시자" 경고를 표시합니다 — 서명되지 않은 솔로 앱의 예상된 동작입니다. 모든 데이터는 로컬에 유지됩니다.
>
> ⚠️ 일부 백신 소프트웨어는 앱이 서명되지 않았기 때문에 패키징 중 압축이 풀린 `electron.exe`를 격리할 수 있습니다. 설치 프로그램이 백신에 의해 제거된 경우 예외를 추가하거나 포터블 빌드를 사용하세요.

### 다운로드 — CLI / TUI / SDK

- **Aether CLI / TUI / SDK** — 헤드리스 CLI, Ink v5 인터랙티브 TUI, Electron-free SDK를 하나의 바이너리로 묶어 제공합니다.

> **Aether는 데스크톱 앱으로 시작했습니다.** CLI와 TUI는 나중에 추가되었으며 아직 개선 중입니다. 단순히 작동하는 AI 워크벤치를 원하시면 **Aether Desktop**부터 시작하세요. CLI/TUI/SDK 계층은 실험적입니다: API와 동작이 변경될 수 있으며 일부 기능이 불완전하거나 신뢰할 수 없을 수 있습니다.

```bash
# Install once (requires Node.js ≥ 22)
npm install -g aetherai
# or, no install:
npx aetherai "fix the failing test" --model deepseek

# Interactive terminal UI (best in Windows Terminal)
aether tui

# Single-shot prompt (CI / scripts)
aether "summarize README.md"

# JSONL RPC for external scripts
echo '{"type":"request","reqId":"c1","method":"listModels","params":{}}' | aether --mode rpc
```

`aether`와 `aetherai`는 동일한 패키지를 가리킵니다. `npm install -g aetherai@0.8.0`로 버전을 고정하면 데스크톱 릴리스와 일치시킬 수 있습니다.

> **GUI와 데이터 공유** — 두 제품은 동일한 SQLite 데이터베이스(`%APPDATA%/aetherai/aetherai.db`)를 사용합니다. 데스크톱 앱에서 시작한 세션은 TUI에서 이어서 사용할 수 있고, 그 반대도 가능합니다.

### 소스에서 실행(개발자 / 고급 사용자)

소스에서 실행하거나 코드를 수정하고 싶다면 `start.bat`을 사용하세요([Node.js 22+](https://nodejs.org) 필요):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

수동 단계별 절차는 [빠른 시작](#-quick-start)을 참조하세요.

> **두 제품, 하나의 소스 트리** — 두 제품은 모두 같은 저장소에 있습니다. `app/electron/`은 공유 에이전트 런타임, `app/src/`는 데스크톱 렌더러, `app/cli.js` + `app/tui/`는 CLI/TUI 진입점입니다. 릴리스는 git 태그(`v*`)로 지정되며, 하나의 태그에서 데스크톱 설치 프로그램과 npm 퍼블리시를 모두 얻을 수 있습니다.

---
## 빠른 시작

**사전 요구사항:** Node.js 22+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

또는 Windows에서 저장소 루트의 `start.bat`을 실행하세요.

### 터미널 사용해 보기(Electron 창 불필요)

```bash
cd app && npm install
node cli.js tui              # 인터랙티브 터미널 UI(Node ≥ 22; Windows Terminal에서 최상의 경험)
node cli.js "안녕하세요"           # 단발 prompt
echo "이것을 요약해 주세요" | node cli.js  # stdin을 prompt로 파이프
node cli.js --mode json "x"  # NDJSON 이벤트 스트림(스크립트/CI)
node cli.js tui --smoke      # headless 상태 머신 스모크
```

### 프로바이더 설정

1. 실행 후 사이드바에서 **Models**를 클릭하세요.
2. 프로바이더를 추가하세요(이름 / API URL / API 키).
3. **Fetch models**를 클릭하여 사용 가능한 모델 목록을 가져오세요.
4. 채팅으로 돌아가 대화를 시작하세요.

### Ask 모드 활성화

1. **Settings - Agent & Safety**를 여세요.
2. 에이전트 권한 모드를 **Ask**로 설정하세요.
3. 작업공간 루트가 에이전트가 읽고/쓸 폴더인지 확인하세요.
4. 무제한 액세스를 원하지 않으면 **Yolo**를 비활성화 상태로 유지하세요.

### 첫 번째 에이전트 작업 실행

1. 새 채팅을 여세요.
2. 질문: `List the files in this project and summarize what the app does.`
3. 제안된 각 도구 호출을 검토하세요. 안전한 읽기는 승인하고 예상치 못한 것은 거부하세요.
4. 실시간 추론 추적과 최종 답변을 확인하세요.

---

## 기능

**상태 라벨:** `Stable` = 일상 사용 가능, `Beta` = 알려진 단점이 있지만 사용 가능, `Experimental` = 새/고급 동작이 변경될 수 있음, `Planned` = 문서화된 로드맵 항목.

### 채팅

| 기능 | 상태 | 설명 |
|---|:---:|---|
| **멀티 프로바이더** | `Stable` | 단일 어댑터 레이어; 프로바이더 추가 = 파일 하나. OpenRouter, Together, DeepSeek, Ollama, LM Studio 등을 지원. |
| **동시 스트리밍** | `Stable` | 한 채팅이 스트리밍되는 동안 다른 채팅에서 계속 대화할 수 있습니다. |
| **Thinking-effort 슬라이더** | `Beta` | 실제 파라미터: 릴레이를 통한 OpenAI o-시리즈 / gpt-5 / Claude. 추론 모델에서만 유효. |
| **첨부 파일** | `Beta` | 컨텍스트로 사용되는 텍스트 파일; 멀티모달용 이미지(비전 모델 필요). |
| **긴 붙여넣기 접기** | `Stable` | 수백 줄을 펼칠 수 있는 스니펫으로 자동 접기(ChatGPT 스타일). |
| **메시지 편집** | `Stable` | 어느 지점에서든 덮어쓰기 + 재생성. |
| **메시지 검색** | `Stable` | 모든 메시지에서 하이라이트와 함께 검색. |
| **사이드바 요약** | `Beta` | 복사된 텍스트가 아닌 모델이 생성한 주제 구절. |

### 에이전트(함수 호출)

- `Beta` **42개 내장 도구** — 파일 작업(`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), 웹(`web_search`, `web_fetch`), 셸(`run_command`), git & GitHub(`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), 코드 인텔리전스(`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), 에이전트 메타(`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — Plan-Act-Observe 루프, 실시간 추론 추적 + 작업 체크리스트, 루프 감지, 도구별 타임아웃, 구성 가능한 반복 예산(기본 25라운드), 컨텍스트 압축 포함.
- `Experimental` **계층적 플래닝** — 복잡한 요청에 대한 작업 분해 자동 생성.
- `Experimental` **하위 에이전트 위임** — `delegate_task`를 통해 독립적인 하위 작업이 병렬로 실행.
- `Stable` **권한 모드** — 위험도 상승 순서의 사다리:

| 모드 | 설명 | 샌드박스 |
|---|---|:---:|
| **Off** | 일반 채팅, 도구 없음 | N/A |
| **Plan** | 읽기 전용 도구(변경 없이 조사) | - |
| **Ask** | 위험한 각 작업을 확인(권장) | - |
| **Auto** | 모든 것을 실행, 확인 없음 | 예 |
| **Yolo** | 전체 권한, 샌드박스 없음 | 아니요 |

- `Stable` **작업공간 샌드박스** — `write_file`/`edit_file`은 구성된 작업공간 루트 밖에서 거부됩니다; `run_command`는 파괴적인 패턴을 차단합니다. Settings - Agent & Safety에서 구성 가능.
- `Beta` **컨텍스트 압축** — 오래된 기록을 자동 요약(도구 호출/결과 쌍은 그대로 유지; 식별자는 원문 그대로 보존).
- `Beta` **도구 호출 수리** — 잘못된 JSON, 누락된 인수, 따옴표 없는 키, 잘린 호출을 자동 수리.

### 메모리 & 학습

- `Beta` **자동 장기 메모리** — 매 턴 전에 관련 메모리가 주입; 핵심 사실이 자동으로 추출되어 저장됩니다. Settings - Agent에서 토글 가능.
- `Experimental` **습관 학습기** — 반복되는 선호도(예: "항상 Claude 사용")를 감지하고 자동 적용 스킬을 제안.
- `Beta` **감사 로그** — 디버깅용 턴별 에이전트 실행 추적.

### 아레나

- `Beta` **멀티 모델 아레나** — 하나의 프롬프트에 여러 모델이 **동시에** 응답; 최고를 투표하면 **ELO 리더보드**가 자동 업데이트됩니다. 모델은 **의도별**(코딩 / 수학 / 번역 / 요약 / 일반)로 점수가 매겨집니다. *ELO가 내장된 멀티 모델 아레나를 제공하는 다른 로컬 우선 데스크톱 채팅 앱은 없습니다.*

### 스킬 & 확장성

| 구성 요소 | 형식 | 상태 | 세부 사항 |
|---|---|:---:|---|
| **스킬** | `SKILL.md` | `Experimental` | `<workspace>/.claude/skills/`에 넣기; `release-checklist` 및 `git-commit` 포함 |
| **슬래시 명령** | `CMD.md` | `Stable` | 6개 내장: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **후크** | Script | `Experimental` | 10개 라이프사이클 지점: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | 외부 MCP 서버가 내장 도구와 자동 병합 |

### 사용자 정의

| 설정 | 상태 | 설명 |
|---|:---:|---|
| **고급 모델 설정** | `Stable` | 최대 토큰, temperature, top_p, 커스텀 시스템 프리픽스, 언어별 자동 제목, thinking effort |
| **커스텀 배경** | `Stable` | 불투명도 / 블러 컨트롤과 함께 이미지 업로드 |
| **페르소나** | `Stable` | 시스템 프롬프트 프리셋, 세션별 전환 가능 |
| **테마** | `Stable` | 라이트 / 다크 / 블루 / 글래스 / 레트로 |
| **15개 UI 언어** | `Beta` | 영어, 중국어(간/번/문언), 일본어, 스페인어, 프랑스어, 독일어, 포르투갈어, 러시아어, 우크라이나어, 아랍어(RTL), 힌디어, 한국어 |
| **자동 업데이트** | `Beta` | NSIS 설치 프로그램이 실행 시 확인; 포터블도 확인(수동 설치) |
| **사용량 추적** | `Beta` | 토큰, 비용, 지연 시간, 캐시 적중률을 포함한 API 호출별 로그 |

### 프라이버시

> **모든 데이터는 로컬에 유지됩니다.** Aether는 귀하에 대한 어떤 것도 수집하거나 업로드하지 않습니다. API 키, 대화, 페르소나는 로컬 SQLite 데이터베이스에 저장됩니다. 유일한 외부 네트워크 요청은 귀하가 구성한 LLM 프로바이더로 전송됩니다.

---

## 터미널 TUI, RPC & SDK

데스크톱 앱과 일반 CLI 외에도 Aether는 인터랙티브 터미널 UI, 머신 호출 가능한 JSONL RPC 모드, Electron-free SDK를 제공합니다. 세 가지 모두 데스크톱과 동일한 에이전트 코어, 메모리, 페르소나, MCP 도구, 권한 규칙을 공유합니다.

### 빠른 시작 — 이중 형태

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

추가 헤드리스 플래그: `--persona <id>`(페르소나 + 메모리 주입), `--memory-trace`(주입된 메모리 항목 수 보고), `--skills`(스킬 제안 JSON), `--setup-term`(Windows Terminal 프로필 작성), `--stdin`(명시적 파이프 입력), `--resume` / `--session <id>` / `--fork [<id>]`(세션 이어서 실행; context-only — 이번 실행의 턴은 다시 기록되지 않음), `-o` / `--output-last-message <file>`(최종 답변을 파일에 기록), `--version`, `--list-models` / `--list-providers`, 그리고 `aether completion bash|zsh|powershell`(셸 완성 스크립트).

기본값은 `~/.config/aether/config.json`(`model` / `mode` / `workspace` / `maxIterations`)과 `AETHER_MODEL` / `AETHER_MODE` / `AETHER_WORKSPACE` / `AETHER_MAX_ITERATIONS` / `AETHER_CONFIG` 환경 변수에서 가져옵니다. 우선순위: CLI 플래그 > 환경 변수 > 설정 파일 > DB 기본값. JSON `done` 프레임은 가격 테이블이 있을 때 `estimatedCost`(USD)를 전달합니다.

### TUI (`aether tui`)

인터랙티브 터미널 에이전트(Ink v5; Node ≥ 22; Windows Terminal에서 가장 좋은 경험):

- **세션**: 메시지 스트리밍 렌더링, 매 턴 SQLite에 저장(종료해도 유지), `--continue` / `--session <id>` / `--fork`로 재개, 첫 프롬프트 기반 자동 제목, `/fork` 세션 트리(`session.parent_session_id`), `/sessions`, `/use <id>` 기록 전환
- **하나의 런타임, 여러 클라이언트**: 데스크톱 GUI와 TUI는 동일한 SQLite 세션을 공유합니다 — GUI에서 시작한 채팅을 `aether tui --session <id>`로 터미널에서 이어서 사용할 수 있고(ID는 `aether tui --continue` 또는 GUI 사이드바에서 확인), 그 반대도 가능합니다. 헤드리스 CLI(`--resume`/`--fork`)도 같은 세션을 읽습니다.
- **도구와 권한**: 도구 호출 카드(상태 색상/소요 시간/요약), diff 검토(`Alt+v` 펼치기, `Enter` 수락 / `r` 롤백 — 쓰기 전 스냅샷 복원, git 디렉토리가 아니어도 유효), 키보드 권한 게이트(`y` 한 번 허용 / `a` 항상 허용 / `n` 거부, 또는 `←→` 선택), 읽기 전용 도구 자동 통과
- **승인 모드**: `Shift+Tab`으로 `manual → auto-edits → plan` 순환(plan = 읽기 전용 플래닝, 완료 후 세 가지 옵션으로 구현 방식 결정); `/approval-mode dontask`는 규칙 기반 승인만 실행(쓰기 도구에는 allow 규칙 필요)
- **모드**: `Alt+m`으로 ask/plan/auto 전환; `/persona <id>` 페르소나 전환(페르소나 + 메모리 프리픽스 주입)
- **leader 단축키**: `Ctrl+X` 후 `m` 모델 선택기 / `n` 새 세션 / `l` 세션 목록 / `g` 타임라인 / `r` rewind 체크포인트 / `q` 종료 / `e` 외부 에디터
- **명령 팔레트**: `Ctrl+P` 또는 `x`(New chat / Model / History (sessions) / Timeline / Export JSONL / Help / Quit)
- **키 바인딩 재설정 가능**: `~/.config/aether/keybindings.json`(예: `{ "char:?": null }`로 `?` 도움말 키 비활성화)
- **API 키 영속화**: `/apikey <provider> <key>`를 `auth.json`에 저장(데스크톱 버전의 safeStorage로 암호화된 키는 headless에서 해독할 수 없으므로 이 명령 또는 환경 변수 `AETHER_API_KEY` 사용)
- **메모리와 스킬 폐루프**: `/memory <키워드>` 검색, `--memory-trace` 주입 항목 수, `/skills` + `/skill accept|dismiss <key>`(habitLearner → 스킬 제안)
- **todo와 즐겨찾기**: `Ctrl+T` 라이브 에이전트 todo 체크리스트 토글, `Ctrl+F` 현재 모델 즐겨찾기 추가/해제(영속화), `F2` 최근 모델 순환
- **`@` 파일과 `!` 셸**: `@` 입력 시 파일 선택기(제출 시 파일 내용 주입, ≤50KB), `!command`는 셸 명령을 샌드박스를 통해 실행하고 출력을 모델에 전달
- **세션 컨텍스트 명령**: `/compact` / `/compress-fast`(기록 압축), `/context`(사용량), `/clear`(새 세션), `/undo`(마지막 턴 + 파일 스냅샷 롤백), `/recap`(한 줄 요약), `/rename` / `/delete`, `/diff`(커밋되지 않은 변경 뷰어), `/permissions add <name> <ruleKey> <allow|deny|ask>`, `/provider add|list`
- **첫 실행 부트스트랩**: 데스크톱 실행이 필요 없음 — `aether tui`가 데이터베이스를 자동 생성하고 `/provider add`로 프로바이더를 설정하도록 안내
- **steering**: 실행 중 `Ctrl+C` 중단 → 다음 입력 → 현재 루프에 주입(큐에 `steer:n` 표시); 실행 중 `Tab`으로 바로 다음 항목 대기열 추가
- **단축키**: `Esc` 두 번 누르면 종료(또는 `/quit`), `Esc` 입력 지우기(초안은 기록에 저장), `?` 도움말 화면, `PgUp/PgDn`/마우스 휠로 메시지 영역 한 줄씩 스크롤, `Alt+↑/↓` 메시지 선택, `Shift+Enter` 입력창 줄 바꿈; 상태 표시줄에 `approval/mode/model/tok/ctx` 실시간 표시; 전체 키 바인딩은 [docs/tui-keys.md](./docs/tui-keys.md) 참조

### RPC (`aether --mode rpc`)

stdin/stdout을 통한 머신 호출 가능한 JSONL 프로토콜: `request` 프레임 입력, `event`/`result`/`error` 프레임 출력 — 줄마다 하나의 JSON 객체, 사람이 읽는 텍스트 없음. 메서드: `run`(`text`/`tool`/`plan`/`status` 이벤트 스트리밍), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. 프레임 참조: [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

외부 Node 프로젝트를 위한 에이전트 코어의 Electron-free 집계: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory`(prefetch/recall/search/…), `classifyAgentMode`, `rpc` 프레임, `sessionContext`(페르소나 + 메모리 주입). 타입 선언 포함(`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Windows 네이티브

| 기능 | 설명 |
|---|---|
| **트레이 메뉴** | 창 표시/숨기기, 새 세션, **새 작업**(TaskPanel 직접 열기); 트레이 클릭으로 표시/숨기기 전환. |
| **전역 단축키** | `Ctrl+Alt+A`로 메인 창 표시(실행되지 않았으면 생성); 등록 결과는 시작 로그에 기록. |
| **`aetherai://` 프로토콜** | `aetherai://new` / `chat` 새 세션 생성; `aetherai://tui` 터미널 형태 안내; `aetherai://open/?path=<인코딩 경로>` 폴더를 작업공간으로 설정하고 새 세션 생성(마우스 오른쪽 버튼 "Aether로 열기" 링크). |
| **오른쪽 클릭 등록** | `app/resources/register-protocol.reg`(`<AETHER_EXE>` 교체 후 관리자 권한으로 가져오기): `.cs/.js/.ts/.tsx/.md/.json` + 폴더 → 오른쪽 클릭 "Aether로 열기". |
| **터미널 부팅** | `app/resources/term/aether.ps1`(별칭 + `aether tui` 시작); `node app/cli.js --setup-term`으로 Windows Terminal 프로필 작성(다크/라이트 두 가지 색상). |
| **샌드박스 강화** | Windows 경로 방어: `\\?\` 긴 경로, UNC `\\server\share`, 재분석 지점/junction 탈출, `.lnk/.scr/.msi` 등 위험한 확장자. |

---

## 프로젝트 구조

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
└── resources/             # App icons
```

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 데스크톱 | Electron 43 |
| 프론트엔드 | React 18.3 + TypeScript 5.8 |
| 상태 | Zustand 4.5 |
| 빌드 | Vite 8 + electron-builder |
| 데이터베이스 | better-sqlite3 (native SQLite, WAL mode) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |
| TUI | Ink 5 + React 18 (createElement, no JSX) |
| CLI/SDK | Node.js headless CLI (4 modes) + Electron-free SDK |

---

## 감사의 말

Aether는 다음 프로젝트들의 어깨 위에 서 있습니다 — 그들의 아이디어가 아키텍처와 UX를 형성했습니다:

### 에이전트 프레임워크

| 프로젝트 | 영감 |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | 컨텍스트 압축, 도구 호출 루프 감지, 이벤트 스트림 아키텍처 |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | 반복 예산, 구조화된 장기 메모리, 자율 스킬, cron 스케줄러, FTS5 메모리 검색 |
| [Evolver](https://github.com/EvoMap/evolver) | 자가 진화 엔진, GEP(Genome Evolution Protocol) |
| [Aider](https://github.com/Aider-AI/aider) | LLM 코딩 어시스턴트 도구 루프, git 통합 |
| [Cline](https://github.com/cline/cline) | IDE 내장 에이전트, MCP 통합, 권한 UX |
| [OpenCode](https://github.com/sst/opencode) | TUI 키보드/테마/권한 UX, 프롬프트 캐시 정책 레이어 |
| [OpenAI Codex](https://github.com/openai/codex) | 샌드박스 프로세스 트리 격리, 경과 시간/상태 표시 UX |

### UI & UX

| 프로젝트 | 영감 |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() 복사-붙여넣기 컴포넌트 방법론 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 애니메이션 패턴(shimmer, blur-fade) |
| [cc-switch](https://github.com/farion1231/cc-switch) | 사용 통계 대시보드 레이아웃 |

### 인프라

| 프로젝트 | 영감 |
|---|---|
| [MCP](https://modelcontextprotocol.io) | Aether의 에이전트가 사용하는 스펙 |
| [new-api](https://github.com/QuantumNous/new-api) | reasoning-effort 파라미터 형태(릴레이 변환 로직) |

---

## 기여

모든 기여를 환영합니다! 버그 수정, 기능 요청, 번역 개선, 문서 업데이트 등 무엇이든 — 이슈를 열거나 PR을 제출해 주세요.

1. 저장소를 포크하세요
2. 기능 브랜치를 만드세요(`git checkout -b feat/my-feature`)
3. 변경 사항을 커밋하세요(`git commit -am 'Add feature'`)
4. 브랜치로 푸시하세요(`git push origin feat/my-feature`)
5. Pull Request를 여세요

자세한 지침은 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참조하세요.

---

## 라이선스

[MIT](./LICENSE) © 2025 Aether

---

<div align="center">

❤️를 담아 Electron + Node.js + React + TypeScript로 제작

[⬆ 맨 위로](#aether)

</div>