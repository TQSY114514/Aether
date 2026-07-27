<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दీ](./README.hi.md) · [한국어](./README.ko.md)


---

> **Status: beta.** AetherAI é um projeto pessoal/hobby. Funciona, mas espere arestas. Relatórios de bugs são bem-vindos — veja [CONTRIBUTING.md](./CONTRIBUTING.md) e [SECURITY.md](./SECURITY.md).


O AetherAI unifica múltiplos provedores de LLM (OpenAI / Claude / DeepSeek / modelos locais / qualquer endpoint compatível com OpenAI) em um único aplicativo de desktop. Tudo é armazenado localmente — suas chaves de API e conversas nunca saem da sua máquina, exceto para os provedores que você configurar.

## 📑 Table of Contents

- [✨ Recursos](#-recursos)
  - [🖥️ Chat](#️-chat)
  - [🤖 Agente (function calling)](#-agente-function-calling)
  - [🔒 Privacidade](#-privacidade)
- [🚀 Início rápido](#-início-rápido)
- [📁 Estrutura do projeto](#-estrutura-do-projeto)
- [🤝 Agradecimentos](#-agradecimentos)
- [📄 Licença](#-licença)

---

## ✨ Recursos

### 🖥️ Chat

- **Abstração multi-provedor** — uma única camada de adaptador; adicionar um formato de provedor significa um arquivo. Atualmente compatível com OpenAI (cobre OpenRouter, Together, DeepSeek, o shim OpenAI do Ollama, LM Studio, …).
- **Streaming multi-sessão concorrente** — um chat pode transmitir enquanto você continua conversando em outro.
- **Arena** — um prompt, múltiplos modelos respondem de uma vez; vote no melhor e um ranking ELO é atualizado automaticamente.
- **Personas** — predefinições de system prompt, alternáveis por sessão.
- **Anexos** — arquivos de texto são injetados como contexto; imagens seguem por via multimodal (exige um modelo de visão).
- **Colapso de colagens longas** — colar centenas de linhas recolhe automaticamente em um trecho expansível (estilo ChatGPT).
- **Controle deslizante de esforço de raciocínio** — parâmetros reais: série-o da OpenAI → `reasoning_effort`, Claude → `thinking.budget_tokens`.
- **Resumos na barra lateral** — os títulos são frases de tópico geradas pelo modelo (ex. "Conselho sobre novo pull de Eiyuu Angel"), e não texto copiado.
- **Configurações avançadas** — max tokens, temperature, top_p, prefixo de sistema personalizado, títulos automáticos por idioma.
- **Plano de fundo personalizado** — envie uma imagem com controles de opacidade / desfoque.
- **15 idiomas de UI** — English (padrão + de cabeça para baixo), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Temas** — Light / Dark / Blue / Glass / Retro.

### 🤖 Agente (function calling)

- **13 ferramentas integradas** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) com um loop Plan→Act→Observe e rastro de raciocínio ao vivo.
- **Modos de permissão do agente** — Off / Ask (confirmar cada ferramenta arriscada) / Auto (permitir todas) / Plan (somente leitura). Espelha o modelo de permissões de um agente de programação.
- **Suporte a MCP** — conecte servidores MCP stdio externos; as ferramentas deles se mesclam automaticamente às integradas.
- **Tool call repair** — Os LLMs às vezes produzem JSON malformado; o loop do agente repara automaticamente argumentos faltantes, chaves não citadas e chamadas truncadas antes da execução.

---

## 🚀 Início rápido

### Pré-requisitos
- Node.js 18+
- npm 9+

### Instalar e executar
```bash
cd app
npm install
npm run dev      # desenvolvimento (hot reload)
npm run build    # compilar o frontend de produção
npm start        # iniciar o Electron
```

Ou execute `start.bat` na raiz do repositório no Windows.

### Configure seu primeiro provedor
1. Após a inicialização, clique em **Models** na barra lateral.
2. Adicione um provedor (nome / URL da API / API Key).
3. Clique em **Fetch models** para obter a lista de modelos disponíveis.
4. Volte ao chat e comece a conversar.

---

<p align="center">
  <img src="assets/architecture.svg" width="100%" alt="AetherAI Architecture Overview">
</p>

---

