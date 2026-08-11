<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Local-first · Multi-model · Agent-native

Converse com qualquer modelo, execute um agente de codificação seguro e compare modelos lado a lado — no seu desktop ou no seu terminal.

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 43](https://img.shields.io/badge/Electron-43-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>As traduções podem estar desatualizadas em relação às versões em inglês / chinês simplificado.</sup>

</div>

---

> **Status: Beta.** AetherAI é um projeto solo/hobby. Ele funciona, mas espere
> arestas ásperas. Relatórios de bugs são bem-vindos — veja [CONTRIBUTING.md](./CONTRIBUTING.md) e
> [SECURITY.md](./SECURITY.md).

**Plataforma: apenas Windows.** Builds oficiais, testes e suporte têm como alvo o Windows. macOS / Linux podem ser compilados a partir do código-fonte, mas não são oficialmente suportados, e a assinatura de código não está planejada — espere um aviso do SmartScreen "publicador desconhecido" no primeiro lançamento (veja [Download](#download)).

**Um app para cada modelo.** OpenAI / Claude / DeepSeek / modelos locais / qualquer endpoint compatível com OpenAI — converse, execute um agente de codificação e compare modelos frente a frente em uma arena multi-modelo com votação ELO.

**Local-first por design.** Chaves de API e conversas ficam em um banco de dados SQLite local e nunca saem da sua máquina — exceto para os provedores que você configurar.

**Seguro por padrão.** O agente integrado roda dentro de uma sandbox de workspace com uma escada de permissões: o acesso a arquivos e comandos é confirmado antes de acontecer, e cada chamada de ferramenta é auditável.

---

## O que torna AetherAI diferente

AetherAI combina várias capacidades que normalmente estão espalhadas por múltiplas ferramentas em um único app desktop local:

| Capacidade | Descrição | Maturidade |
|---|---|:---:|
| **Chat multi-provedor** | Alterne entre OpenAI, Claude, DeepSeek e qualquer endpoint compatível com OpenAI no meio da conversa. | `Stable` |
| **Loop de ferramentas do Agente** | 42 ferramentas integradas com loop Plan-Act-Observe, sandboxing e escada de permissões. | `Beta` |
| **Arena multi-modelo** | Envie um prompt para vários modelos, vote no melhor, acompanhe os rankings ELO. | `Beta` |
| **Habilidades e Extensibilidade** | Arquivos `SKILL.md` plug-and-play, servidores MCP, sistema de hooks de 10 pontos. | `Experimental` |
| **Memória Estruturada** | O agente recorda preferências e decisões passadas entre sessões. | `Beta` |
| **Planejamento Hierárquico** | Pedidos complexos são decompostos automaticamente em sub-tarefas paralelas. | `Experimental` |
| **Compactação de Contexto** | Conversas longas são resumidas automaticamente sem perder os pares de chamadas de ferramentas. | `Beta` |
| **Privacidade Local-First** | Conversas, chaves e personas em SQLite local. Nada sai da sua máquina. | `Stable` |
| **15 idiomas de UI** | Incluindo chinês clássico (文言) e árabe RTL. | `Beta` |
| **Terminal TUI** | Terminal interativo Ink v5: fluxo de sessões, cartões de ferramentas, revisão/rollback de diff, porta de permissão por teclado, árvore de sessões `/fork`, `/memory`, re-injeção de steering durante a execução. | `Beta` |
| **Headless CLI · RPC · SDK** | CLI de quatro modos (disparo único / NDJSON / JSONL RPC / pipe), SDK sem Electron (`aetherai/sdk`), protocolo JSONL invocável por máquina. | `Beta` |
| **Licença MIT** | Totalmente open source. | `Stable` |

---

## Download

### Windows — Instalador pré-compilado (recomendado para a maioria dos usuários)

Baixe a [Release](https://github.com/TQSY114514/Aether/releases) mais recente:

| Build | Descrição |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | Instalador NSIS. Por usuário (sem admin), atualizações automáticas no app. **Recomendado.** |
| **`AetherAI-x.y.z.exe`** | Exe único portátil. Sem instalação, sem atualização automática; basta executá-lo. |

> O instalador mostra um aviso do SmartScreen "publicador desconhecido" no primeiro lançamento — esperado para um app solo não assinado. Todos os dados permanecem locais.
>
> ⚠️ Algum software antivírus pode colocar em quarentena o `electron.exe` desempacotado durante o empacotamento porque o app não é assinado. Se o instalador for removido pelo seu AV, adicione uma exclusão ou use a versão portátil.

### Executar a partir do código-fonte (desenvolvedores / usuários avançados)

Se você prefere executar a partir do código-fonte, ou deseja modificar o código, use `start.bat` (requer [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

Veja [Início rápido](#-quick-start) para o passo a passo manual.

> **exe vs start.bat** — ambos são suportados e atendem a públicos diferentes:
> - **Instalador exe** — para usuários finais: duplo clique para instalar, entrada no Menu Iniciar, atualização automática no app, sem necessidade de Node.js.
> - **start.bat** — para desenvolvedores / entusiastas: pipeline transparente `npm install` → `vite build` → `electron .`, edite-e-execute, requer Node.js.

---

## Início rápido

**Pré-requisitos:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

Ou execute `start.bat` na raiz do repositório no Windows.

### Experimente o terminal (sem precisar de janela do Electron)

```bash
cd app && npm install
node cli.js tui              # 交互终端 UI（Node ≥ 22；Windows Terminal 体验最佳）
node cli.js "你好"           # 单发 prompt
echo "总结一下" | node cli.js  # 管道 stdin 作为 prompt
node cli.js --mode json "x"  # NDJSON 事件流（脚本/CI）
node cli.js tui --smoke      # headless 状态机冒烟
```

### Configurar provedor

1. Após o lançamento, clique em **Models** na barra lateral.
2. Adicione um provedor (nome / URL da API / chave da API).
3. Clique em **Fetch models** para carregar a lista de modelos disponíveis.
4. Volte ao chat e comece a conversar.

### Habilitar o modo Ask

1. Abra **Settings - Agent & Safety**.
2. Defina o modo de permissão do agente como **Ask**.
3. Confirme que a raiz do workspace é a pasta na qual você quer que o agente leia/grave.
4. Mantenha **Yolo** desativado, a menos que você queira acesso irrestrito.

### Execute sua primeira tarefa de agente

1. Abra um novo chat.
2. Pergunte: `List the files in this project and summarize what the app does.`
3. Revise cada chamada de ferramenta proposta. Aprove leituras seguras; negue qualquer coisa inesperada.
4. Verifique o rastreamento de raciocínio em tempo real e a resposta final.

---

## Recursos

**Rótulos de status:** `Stable` = pronto para uso diário, `Beta` = utilizável com arestas conhecidas, `Experimental` = comportamento novo/avançado pode mudar, `Planned` = item documentado no roadmap.

### Chat

| Recurso | Status | Descrição |
|---|:---:|---|
| **Multi-provedor** | `Stable` | Camada de adaptador única; adicionar um provedor = um arquivo. Cobre OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Streaming concorrente** | `Stable` | Um chat faz streaming enquanto você continua conversando em outro. |
| **Slider de esforço de raciocínio** | `Beta` | Parâmetros reais: OpenAI série o / gpt-5 / Claude via relay. Só é eficaz em modelos de raciocínio. |
| **Anexos** | `Beta` | Arquivos de texto como contexto; imagens para multimodal (requer um modelo de visão). |
| **Recolhimento de colagem longa** | `Stable` | Centenas de linhas são recolhidas automaticamente em um trecho expansível (estilo ChatGPT). |
| **Edição de mensagens** | `Stable` | Sobrescrever + regenerar a partir de qualquer ponto. |
| **Busca de mensagens** | `Stable` | Com destaque em todas as mensagens. |
| **Resumos da barra lateral** | `Beta` | Frases de tópico geradas por modelo, não texto copiado. |

### Agente (Function Calling)

- `Beta` **42 ferramentas integradas** — operações de arquivo (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), web (`web_search`, `web_fetch`), shell (`run_command`), git e GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), inteligência de código (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), metadados do agente (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — com loop Plan-Act-Observe, rastreamento de raciocínio em tempo real + checklist de tarefas, detecção de loops, timeouts por ferramenta, orçamento de iterações configurável (padrão 25 rodadas) e compactação de contexto.
- `Experimental` **Planejamento hierárquico** — gera automaticamente a divisão de tarefas para pedidos complexos (inspirado no DS4).
- `Experimental` **Delegação de sub-agentes** — sub-tarefas independentes rodam em paralelo via `delegate_task`.
- `Stable` **Modos de permissão** — escada de risco crescente:

| Modo | Descrição | Sandbox |
|---|---|:---:|
| **Off** | Chat simples, sem ferramentas | N/A |
| **Plan** | Ferramentas somente leitura (investigar sem alterações) | - |
| **Ask** | Confirme cada ação arriscada (recomendado) | - |
| **Auto** | Execute tudo, sem confirmações | Sim |
| **Yolo** | Permissão total, sem sandbox | Não |

- `Stable` **Sandbox de workspace** — `write_file`/`edit_file` são recusados fora da raiz configurada do workspace; `run_command` bloqueia padrões destrutivos. Configurável em Settings - Agent & Safety.
- `Beta` **Compactação de contexto** — resume automaticamente o histórico mais antigo (pares de chamada/resultado de ferramentas mantidos intactos; identificadores preservados literalmente).
- `Beta` **Reparo de chamadas de ferramenta** — repara automaticamente JSON malformado, argumentos ausentes, chaves sem aspas e chamadas truncadas.

### Memória e Aprendizado

- `Beta` **Memória de longo prazo automática** — memórias relevantes são injetadas antes de cada turno; fatos-chave são extraídos e salvos automaticamente. Alternável em Settings - Agent.
- `Experimental` **Aprendiz de hábitos** — detecta preferências recorrentes (ex.: "sempre usar Claude") e propõe habilidades aplicadas automaticamente.
- `Beta` **Log de auditoria** — rastreamento de execução do agente por turno para depuração.

### Arena

- `Beta` **Arena multi-modelo** — um prompt, vários modelos respondem **simultaneamente**; vote no melhor e um **ranking ELO** é atualizado automaticamente. Os modelos são avaliados **por intenção** (codificação / matemática / tradução / resumo / geral). *Nenhum outro app desktop local-first de chat oferece uma arena multi-modelo integrada com ELO.*

### Habilidades e Extensibilidade

| Componente | Formato | Status | Detalhes |
|---|---|:---:|---|
| **Habilidades** | `SKILL.md` | `Experimental` | Coloque em `<workspace>/.claude/skills/`; acompanha `release-checklist` e `git-commit` |
| **Comandos de barra** | `CMD.md` | `Stable` | 6 integrados: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 pontos do ciclo de vida: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Servidores MCP externos se integram automaticamente às ferramentas integradas |

### Personalização

| Configuração | Status | Descrição |
|---|:---:|---|
| **Configurações avançadas de modelo** | `Stable` | Máximo de tokens, temperature, top_p, prefixo de sistema personalizado, títulos automáticos por idioma, esforço de raciocínio |
| **Fundo personalizado** | `Stable` | Envie uma imagem com controles de opacidade / desfoque |
| **Personas** | `Stable` | Predefinições de system prompt, alternáveis por sessão |
| **Temas** | `Stable` | Claro / Escuro / Azul / Glass / Retro |
| **15 idiomas de UI** | `Beta` | Inglês, chinês (简/繁/文言), japonês, espanhol, francês, alemão, português, russo, ucraniano, árabe (RTL), hindi, coreano |
| **Atualização automática** | `Beta` | O instalador NSIS verifica no lançamento; a versão portátil também (instalação manual) |
| **Rastreamento de uso** | `Beta` | Log por chamada de API com tokens, custo, latência, taxa de acerto de cache |

### Privacidade

> **Todos os dados permanecem locais.** AetherAI não coleta nada e não envia nada sobre você. Suas chaves de API, conversas e personas ficam em um banco de dados SQLite local. As únicas requisições de rede de saída vão para os provedores de LLM que você configurar.

---

## Extensão VS Code e CLI headless

Além do app desktop, AetherAI entrega o mesmo agente como CLI e como extensão de editor:

- **CLI headless** (`app/cli.js`) — execute o agente de forma não interativa, alimente scripts/CI com eventos NDJSON:
  ```bash
  node app/cli.js "fix the failing test" --workspace . --mode auto --max-iterations 30 --json-lines
  ```
- **Extensão VS Code** (`extension/`) — inicia a CLI em um painel de chat: streaming ao vivo de chamadas de ferramentas, ações de bloco de código (Inserir / Gravar arquivo) e **cartões de diff de arquivo**: cada chamada `write_file` / `edit_file` / `apply_patch` renderiza um diff em nível de linha contra o conteúdo do arquivo antes da alteração, com **Reverter** em um clique (restaura o snapshot tirado antes de a ferramenta rodar). Requer a configuração da extensão `aether.cliPath` (detectada automaticamente quando o repositório é clonado localmente).
- **Gateway local** (`127.0.0.1:35791`) — API REST compatível com OpenAI com base no app desktop (Settings → Local Gateway → token); uma segunda extensão (`extensions/vscode-aether/`) se conecta por meio dele.

---

## TUI de terminal, RPC e SDK

Além do app desktop e da CLI simples, AetherAI entrega uma interface de terminal interativa, um modo JSONL RPC invocável por máquina e um SDK sem Electron. Todos os três compartilham o mesmo núcleo de agente, memória, personas, ferramentas MCP e regras de permissão do desktop.

### Início rápido — forma dupla

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

Sinalizadores headless adicionais: `--persona <id>` (persona + injeção de memória), `--memory-trace` (reporta o número de entradas de memória injetadas), `--skills` (JSON de propostas de habilidades), `--setup-term` (grava o perfil do Windows Terminal), `--stdin` (entrada explícita via pipe).

### TUI (`aether tui`)

Agente de terminal interativo (Ink v5; Node ≥ 22; melhor experiência no Windows Terminal):

- **Sessões**: renderização em streaming de mensagens, árvore de sessões `/fork` (`session.parent_session_id`), `/sessions`, alternância de histórico com `/use <id>`
- **Ferramentas e permissões**: cartões de chamada de ferramentas (cor de status / duração / resumo), revisão de diff (`Alt+v` para expandir, `Enter` para aceitar / `r` para reverter — restaura o snapshot pré-gravação, funciona mesmo fora de diretórios git), porta de permissão por teclado (`y` permitir uma vez / `a` permitir sempre / `n` negar, ou `←→` para selecionar), ferramentas somente leitura liberadas automaticamente
- **Modo de aprovação**: `Shift+Tab` percorre `manual → auto-edits → plan` (plan = planejamento somente leitura; ao concluir, três opções decidem como implementar)
- **Modos**: `Alt+m` alterna entre ask/plan/auto; `/persona <id>` troca a persona (injeção de persona + prefixo de memória)
- **Atalhos de leader**: `Ctrl+X` seguido de `m` seletor de modelo / `n` nova sessão / `l` lista de sessões / `g` linha do tempo / `r` checkpoint de rewind / `q` sair
- **Paleta de comandos**: `Ctrl+P` ou `x` (New chat / Model / Timeline / Export JSONL / Help / Quit)
- **Atalhos reconfiguráveis**: `~/.config/aether/keybindings.json` (por exemplo, `{ "char:?": null }` desativa a tecla de ajuda `?`)
- **Persistência de chave de API**: `/apikey <provider> <key>` salva em `auth.json` (chaves criptografadas com safeStorage na versão desktop não podem ser descriptografadas em modo headless; use este comando ou a variável de ambiente `AETHER_API_KEY`)
- **Ciclo de memória e habilidades**: `/memory <palavra-chave>` para buscar, `--memory-trace` número de entradas injetadas, `/skills` + `/skill accept|dismiss <key>` (habitLearner → proposta de habilidade)
- **steering**: `Ctrl+C` durante a execução interrompe → digite a próxima instrução → injeta no loop atual (a fila mostra `steer:n`); `Tab` durante a execução enfileira a próxima instrução diretamente
- **Atalhos**: pressione `Esc` duas vezes para sair (ou `/quit`), `Esc` limpa a entrada (rascunho vai para o histórico), `?` tela de ajuda, `PgUp/PgDn`/roda do mouse para rolar, a barra de status mostra em tempo real `approval/mode/model/tok/ctx`; teclas completas em [docs/tui-keys.md](./docs/tui-keys.md)

### RPC (`aether --mode rpc`)

Protocolo JSONL invocável por máquina via stdin/stdout: frames `request` de entrada, frames `event`/`result`/`error` de saída — um objeto JSON por linha, sem texto humano. Métodos: `run` (faz streaming de eventos `text`/`tool`/`plan`/`status`), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. Referência de frames: [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

Agregação sem Electron do núcleo do agente para projetos Node externos: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, frames `rpc`, `sessionContext` (injeção de persona + memória). Declarações de tipos incluídas (`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Recursos nativos do Windows

| Capacidade | Descrição |
|---|---|
| **Menu de bandeja** | Mostrar/ocultar janela, nova sessão, **nova tarefa** (abre o TaskPanel diretamente); clique na bandeja alterna exibir/ocultar. |
| **Atalho global** | `Ctrl+Alt+A` traz a janela principal (cria se não estiver em execução); o resultado do registro é gravado no log de inicialização. |
| **Protocolo `aetherai://`** | `aetherai://new` / `chat` cria uma nova sessão; `aetherai://tui` sugere a forma do terminal; `aetherai://open/?path=<caminho codificado>` define a pasta como workspace e cria uma nova sessão (fluxo "Abrir com Aether" do menu de contexto). |
| **Registro de menu de contexto** | `app/resources/register-protocol.reg` (importe como administrador após substituir `<AETHER_EXE>`): `.cs/.js/.ts/.tsx/.md/.json` + pastas → "Abrir com Aether" no menu de contexto. |
| **Inicialização do terminal** | `app/resources/term/aether.ps1` (alias + inicia `aether tui`); `node app/cli.js --setup-term` grava o perfil do Windows Terminal (temas claro/escuro). |
| **Reforço da sandbox** | Defesas de caminhos do Windows: caminhos longos `\\?\`, UNC `\\server\share`, escape por reparse points/junctions, extensões perigosas como `.lnk/.scr/.msi`. |

---

## Estrutura do projeto

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

## Stack de tecnologia

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 43 |
| Frontend | React 18.3 + TypeScript 5.8 |
| Estado | Zustand 4.5 |
| Build | Vite 8 + electron-builder |
| Banco de dados | better-sqlite3 (SQLite nativo, modo WAL) |
| LLM | Compatível com OpenAI + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Cliente stdio JSON-RPC 2.0 personalizado |
| TUI | Ink 5 + React 18 (createElement, sem JSX) |
| CLI/SDK | CLI headless Node.js (4 modos) + SDK sem Electron |

---

## Agradecimentos

AetherAI se apoia nos ombros destes projetos — suas ideias moldaram a arquitetura e a UX:

### Frameworks de agentes

| Projeto | Inspiração |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Modelo de permissão do agente, slider de raciocínio, visualização de chamadas de ferramentas, delegação de sub-agentes, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Compactação de contexto, detecção de loop de chamadas de ferramentas, arquitetura de fluxo de eventos |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Orçamento de iterações, memória de longo prazo estruturada, habilidades autônomas |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, compressão de contexto, reparo de chamadas de ferramentas |
| [DS4](https://github.com/antirez/ds4) | Decomposição hierárquica de tarefas |

### UI & UX

| Projeto | Inspiração |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Metodologia de componentes copiar-colar cn() / cva |
| [Magic UI](https://github.com/magicuidesign/magicui) | Padrões de animação (shimmer, blur-fade) |

### Infraestrutura

| Projeto | Inspiração |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Normalização de provedores multi-formato |
| [MCP](https://modelcontextprotocol.io) | O padrão que o agente do AetherAI fala |
| [cc-switch](https://github.com/farion1231/cc-switch) | Layout do dashboard de estatísticas de uso |
| [new-api](https://github.com/QuantumNous/new-api) | Relay de esforço de raciocínio, rastreamento de uso/custo |
| [Continue](https://github.com/continuedev/continue) | Configuração como fonte de verdade, abstração de provedor |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Execução de agente multi-turno, execução de ferramentas em sandbox |
| [Aider](https://github.com/Aider-AI/aider) | Loop de ferramentas de assistente de codificação LLM, integração com git |
| [Cline](https://github.com/cline/cline) | Agente embutido em IDE, integração MCP, UX de permissões |

---

## Contribuição

Todas as contribuições são bem-vindas! Seja uma correção de bug, pedido de recurso, melhoria de tradução ou atualização de documentação — abra uma issue ou envie um PR.

1. Faça um fork do repositório
2. Crie uma branch de recurso (`git checkout -b feat/my-feature`)
3. Faça o commit das suas alterações (`git commit -am 'Add feature'`)
4. Envie para a branch (`git push origin feat/my-feature`)
5. Abra um Pull Request

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para diretrizes detalhadas.

---

## Licença

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Construído com ❤️ usando Electron + React + TypeScript

[⬆ Voltar ao topo](#aetherai)

</div>
