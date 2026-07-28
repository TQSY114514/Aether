<div align="center">

<p align="center">
  <img src="./assets/banner.svg" width="420" alt="AetherAI Banner" />
</p>

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)


---

> **Status: beta.** AetherAI é um projeto pessoal/hobby. Funciona, mas espere arestas. Relatórios de bugs são bem-vindos — veja [CONTRIBUTING.md](./CONTRIBUTING.md) e [SECURITY.md](./SECURITY.md).


O AetherAI unifica múltiplos provedores de LLM (OpenAI / Claude / DeepSeek / modelos locais / qualquer endpoint compatível com OpenAI) em um único aplicativo de desktop. Tudo é armazenado localmente — suas chaves de API e conversas nunca saem da sua máquina, exceto para os provedores que você configurar.

## 📑 Índice

- [🎯 O que diferencia o AetherAI](#-o-que-diferencia-o-aetherai)
- [✨ Recursos](#-recursos)
  - [🖥️ Chat](#️-chat)
  - [🤖 Agente (chamada de função)](#-agente-chamada-de-função)
  - [🧠 Memória e Aprendizado](#-memória-e-aprendizado)
  - [🏟️ Arena](#️-arena)
  - [🛠️ Habilidades e Extensibilidade](#️-habilidades-e-extensibilidade)
  - [⚙️ Personalização](#️-personalização)
  - [🔒 Privacidade](#-privacidade)
- [📸 Capturas de tela](#-capturas-de-tela)
- [📦 Download](#-download)
  - [Windows — Pré-compilado (Recomendado)](#windows--pré-compilado-recomendado)
- [🚀 Início rápido](#-início-rápido)
  - [Instalar a partir do código-fonte](#instalar-a-partir-do-código-fonte)
  - [Configurar provedor](#configurar-provedor)
  - [Ativar o modo Ask](#ativar-o-modo-ask)
  - [Executar sua primeira tarefa de agente](#executar-sua-primeira-tarefa-de-agente)
- [📁 Estrutura do projeto](#-estrutura-do-projeto)
- [🔑 Pilha tecnológica](#-pilha-tecnológica)
- [🤝 Contribuindo](#-contribuindo)
- [🤝 Agradecimentos](#-agradecimentos)
- [📄 Licença](#-licença)

---

## 🎯 O que diferencia o AetherAI

O AetherAI combina várias capacidades que normalmente estão espalhadas por várias ferramentas em um único aplicativo desktop local:

| Capacidade | Descrição | Maturidade |
|---|---|:---:|
| **Chat multi-provedor** | Alterne entre OpenAI, Claude, DeepSeek e qualquer endpoint compatível com OpenAI durante uma conversa. | `Estável` |
| **Loop de ferramentas do Agente** | 16 ferramentas integradas com loop Plan-Act-Observe, sandbox, escada de permissões. | `Beta` |
| **Arena multi-modelo** | Envie um prompt para múltiplos modelos, vote no melhor, acompanhe rankings ELO. | `Beta` |
| **Habilidades e Extensibilidade** | Arquivos `SKILL.md` plug-and-play, servidores MCP, sistema de 10 hooks. | `Experimental` |
| **Memória Estruturada** | O agente recorda preferências e decisões passadas entre sessões. | `Beta` |
| **Planejamento Hierárquico** | Solicitações complexas se auto-decompoem em sub-tarefas paralelas. | `Experimental` |
| **Compactação de Contexto** | Conversas longas se auto-resumem sem perder pares de tool-call. | `Beta` |
| **Privacidade Local-First** | Conversas, chaves e personas em SQLite local. Nada sai da sua máquina. | `Estável` |
| **15 idiomas de UI** | Incluindo Chinês Clássico (文言) e Árabe (RTL). | `Beta` |
| **Licença MIT** | Totalmente open source. | `Estável` |

---

## ✨ Recursos

**Rótulos de status:** `Estável` = pronto para uso diário, `Beta` = utilizável com arestas conhecidas, `Experimental` = comportamento novo/avançado pode mudar, `Planejado` = item de roteiro documentado.

### 🖥️ Chat

| Recurso | Status | Descrição |
|---|:---:|---|
| **Multi-provedor** | `Estável` | Camada de adaptador única; adicionar um provedor = um arquivo. Cobre OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Streaming concorrente** | `Estável` | Um chat transmite enquanto você continua falando em outro. |
| **Controle deslizante de esforço de raciocínio** | `Beta` | Parâmetros reais: OpenAI série-o / gpt-5 / Claude via relay. Apenas eficaz em modelos de raciocínio. |
| **Anexos** | `Beta` | Arquivos de texto como contexto; imagens para multimodal (precisa de um modelo de visão). |
| **Colapso de colagens longas** | `Estável` | Centenas de linhas se auto-recolhem em um trecho expansível (estilo ChatGPT). |
| **Edição de mensagens** | `Estável` | Sobrescrever + regenerar a partir de qualquer ponto. |
| **Busca de mensagens** | `Estável` | Com destaque em todas as mensagens. |
| **Resumos na barra lateral** | `Beta` | Frases de tópico geradas pelo modelo, não texto copiado. |

### 🤖 Agente (chamada de função)

- `Beta` **16 ferramentas integradas** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) com loop Plan-Act-Observe, rastro de raciocínio ao vivo + checklist de tarefas, detecção de loop, timeouts por ferramenta, orçamento configurável de iterações (padrão 25 rodadas) e compactação de contexto.
- `Experimental` **Planejamento hierárquico** — gera auto-decomposição de tarefas para solicitações complexas (inspirado no DS4).
- `Experimental` **Delegação de sub-agente** — sub-tarefas independentes executadas em paralelo via `delegate_task`.
- `Estável` **Modos de permissão** — escada ascendente por risco:

| Modo | Descrição | Sandbox |
|---|---|:---:|
| **Off** | Chat simples, sem ferramentas | N/A |
| **Plan** | Ferramentas apenas-leitura (investigar sem alterações) | - |
| **Ask** | Confirmar cada ação arriscada (recomendado) | - |
| **Auto** | Executar tudo, sem confirmações | Sim |
| **Yolo** | Permissão total, sem sandbox | Não |

- `Estável` **Sandbox de workspace** — `write_file`/`edit_file` são recusados fora da raiz do workspace configurado; `run_command` bloqueia padrões destrutivos. Configurável em Configurações - Agente & Segurança.
- `Beta` **Compactação de contexto** — auto-resume histórico antigo (pares tool-call/result mantidos intactos; identificadores preservados literalmente).
- `Beta` **Reparo de tool call** — auto-repara JSON malformado, argumentos faltantes, chaves sem citação e chamadas truncadas.

### 🧠 Memória e Aprendizado

- `Beta` **Memória de longo prazo automática** — memórias relevantes injetadas antes de cada turno; fatos-chave extraídos e salvos automaticamente. Alternável em Configurações - Agente.
- `Experimental` **Aprendiz de hábitos** — detecta preferências recorrentes (ex. "sempre use Claude") e propõe habilidades auto-aplicadas.
- `Beta` **Log de auditoria** — rastro de execução do agente por turno para depuração.

### 🏟️ Arena

- `Beta` **Arena multi-modelo** — um prompt, múltiplos modelos respondem **concorrentemente**; vote no melhor e um **ranking ELO** atualiza automaticamente. Os modelos são pontuados **por intenção** (codificação / matemática / tradução / resumo / geral). *Nenhum outro aplicativo desktop local-first com chat oferece uma arena multi-modelo integrada com ELO.*

### 🛠️ Habilidades e Extensibilidade

| Componente | Formato | Status | Detalhes |
|---|---|:---:|---|
| **Habilidades (Skills)** | `SKILL.md` | `Experimental` | Coloque em `<workspace>/.claude/skills/`; vem com `release-checklist` e `git-commit` |
| **Comandos Slash** | `CMD.md` | `Estável` | 6 integrados: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 pontos do ciclo de vida: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | Servidores MCP externos se mesclam às ferramentas integradas automaticamente |

### ⚙️ Personalização

| Configuração | Status | Descrição |
|---|:---:|---|
| **Configurações avançadas de modelo** | `Estável` | Max tokens, temperature, top_p, prefixo de sistema personalizado, títulos auto por idioma, esforço de raciocínio |
| **Plano de fundo personalizado** | `Estável` | Envie imagem com controles de opacidade / desfoque |
| **Personas** | `Estável` | Predefinições de system prompt, alternáveis por sessão |
| **Temas** | `Estável` | Light / Dark / Blue / Glass / Retro |
| **15 idiomas de UI** | `Beta` | English, Chinês (简/繁/文言), Japonês, Espanhol, Francês, Alemão, Português, Russo, Ucraniano, Árabe (RTL), Hindi, Coreano |
| **Auto-update** | `Beta` | Instalador NSIS verifica ao iniciar; portable também verifica (instalação manual) |
| **Rastreamento de uso** | `Beta` | Log por chamada de API com tokens, custo, latência, taxa de acerto de cache |

### 🔒 Privacidade

> **Todos os dados permanecem locais.** O AetherAI não coleta nada e não envia nada sobre você. Suas chaves de API, conversas e personas vivem em um banco de dados SQLite local. As únicas requisições de rede externas vão para os provedores de LLM que você configurar.

---

## 📸 Capturas de tela

> Capture screenshots em `assets/screenshots/` e atualize os caminhos abaixo.

| Fluxo | Pré-visualização |
|---|:---:|
| Chat streaming | `assets/screenshots/chat-streaming.gif` — _TODO_ |
| Execução de ferramentas do agente | `assets/screenshots/agent-tool-execution.gif` — _TODO_ |
| Votação na Arena | `assets/screenshots/arena-voting.gif` — _TODO_ |
| Configurações de provedor | `assets/screenshots/provider-settings.png` — _TODO_ |

---

## 📦 Download

### Windows — Pré-compilado (Recomendado)

Baixe o [Release](https://github.com/TQSY114514/AetherAI/releases) mais recente:

| Build | Descrição |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | Instalador NSIS. Por usuário (sem admin), auto-update no app. **Recomendado.** |
| **`AetherAI-x.y.z.exe`** | Portable single-exe. Sem instalação, sem auto-update; basta executar. |

> O instalador mostra um aviso "publicador desconhecido" do SmartScreen no primeiro lançamento — esperado para um app solo sem assinatura. Todos os dados permanecem locais.

---

## 🚀 Início rápido

### Instalar a partir do código-fonte

**Pré-requisitos:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # desenvolvimento (hot reload)
npm run build    # frontend de produção
npm start        # iniciar o Electron
```

Ou execute `start.bat` na raiz do repositório no Windows.

### Configurar provedor

1. Após o início, clique em **Models** na barra lateral.
2. Adicione um provedor (nome / URL da API / API Key).
3. Clique em **Fetch models** para obter a lista de modelos disponíveis.
4. Volte ao chat e comece a conversar.

### Ativar o modo Ask

1. Abra **Configurações - Agente & Segurança**.
2. Defina o modo de permissão do agente como **Ask**.
3. Confirme que a raiz do workspace é a pasta onde você quer que o agente leia/escape.
4. Mantenha **Yolo** desativado a menos que queira acesso irrestrito.

### Executar sua primeira tarefa de agente

1. Abra um novo chat.
2. Pergunte: `List the files in this project and summarize what the app does.`
3. Revise cada tool call proposta. Aprove leituras seguras; negue qualquer coisa inesperada.
4. Verifique o rastro de raciocínio ao vivo e a resposta final.

---

## 📁 Estrutura do projeto

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

## 🔑 Pilha tecnológica

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 31 |
| Frontend | React 18.3 + TypeScript 5.5 |
| Estado | Zustand 4.5 |
| Build | Vite 5.4 + electron-builder |
| Database | sql.js (SQLite in-memory, persisted to disk) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |

---

## 🤝 Contribuindo

Todas as contribuições são bem-vindas! Seja um bug fix, feature request, melhoria de tradução ou atualização de documentação — abra uma issue ou envie um PR.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -am 'Add feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 🤝 Agradecimentos

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

## 📄 Licença

[MIT](./LICENSE) 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#-aetherai)

</div>
