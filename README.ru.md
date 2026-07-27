<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दీ](./README.hi.md) · [한국어](./README.ko.md)


---

> **Статус: бета.** AetherAI — личный/хобби-проект. Работает, но возможны шероховатости. О багах сообщайте — см. [CONTRIBUTING.md](./CONTRIBUTING.md) и [SECURITY.md](./SECURITY.md).


AetherAI объединяет несколько провайдеров LLM (OpenAI / Claude / DeepSeek / локальные модели / любую совместимую с OpenAI конечную точку) в одном настольном приложении. Все данные хранятся локально — ваши API-ключи и переписки никогда не покидают ваш компьютер, за исключением обращений к настроенным вами провайдерам.

## 📑 Table of Contents

- [✨ Возможности](#-возможности)
  - [🖥️ Чат](#️-chat)
  - [🤖 Агент (вызов функций)](#-агент-вызов-функций)
  - [🔒 Конфиденциальность](#-конфиденциальность)
- [🚀 Быстрый старт](#-быстрый-старт)
- [📁 Структура проекта](#-структура-проекта)
- [🤝 Благодарности](#-благодарности)
- [📄 Лицензия](#-лицензия)

---

## ✨ Возможности

### 🖥️ Чат

- **Единая абстракция провайдеров** — один слой адаптеров; добавление формата нового провайдера сводится к одному файлу. На данный момент поддерживается формат, совместимый с OpenAI (охватывает OpenRouter, Together, DeepSeek, OpenAI-шим Ollama, LM Studio и др.).
- **Параллельная потоковая передача в нескольких сессиях** — один чат может вести потоковую передачу, пока вы продолжаете общаться в другом.
- **Арена** — один запрос, отвечают сразу несколько моделей; голосуйте за лучший ответ, и рейтинг ELO обновляется автоматически.
- **Персоны** — готовые системные промпты, переключаемые для каждой сессии.
- **Вложения** — текстовые файлы добавляются как контекст; изображения передаются мультимодально (требуется модель с поддержкой зрения).
- **Свёртка длинных вставок** — вставка сотен строк автоматически сворачивается в раскрываемый фрагмент (в стиле ChatGPT).
- **Ползунок усилия размышления** — реальные параметры: для o-series от OpenAI → `reasoning_effort`, для Claude → `thinking.budget_tokens`.
- **Сводки в боковой панели** — заголовки формируются моделью как тематические фразы (например, «Совет по новому баннеру Eiyuu Angel»), а не как скопированный текст.
- **Расширенные настройки** — max tokens, temperature, top_p, пользовательский системный префикс, автоматические заголовки для каждого языка.
- **Своё фоновое изображение** — загрузите изображение с настройкой прозрачности и размытия.
- **15 языков интерфейса** — English (стандартный + перевёрнутый), 中文 (简体/繁體/文言文), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Темы** — Light / Dark / Blue / Glass / Retro.
- **Локальное хранение** — все данные в локальной базе SQLite; ничего не загружается наружу.

### 🤖 Агент (вызов функций)

- **13 встроенных инструментов** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) с циклом «План → Действие → Наблюдение» и живой трассировкой рассуждений.
- **Режимы разрешений агента** — Выкл / Спрашивать (подтверждать каждое рискованное действие) / Авто (разрешать всё) / План (только чтение). Повторяет модель разрешений агента для программирования.
- **Поддержка MCP** — подключайте внешние stdio MCP-серверы; их инструменты автоматически объединяются со встроенными.
- **Tool call repair** — LLMs иногда производят неверный JSON; цикл агента автоматически исправляет отсутствующие аргументы, незакавыченные ключи и усечённые вызовы перед выполнением.

---

## 🚀 Быстрый старт

### Предварительные требования
- Node.js 18+
- npm 9+

### Установка и запуск
```bash
cd app
npm install
npm run dev      # разработка (горячая перезагрузка)
npm run build    # сборка продакшен-фронтенда
npm start        # запуск Electron
```

Либо запустите `start.bat` в корне репозитория на Windows.

### Настройка первого провайдера
1. После запуска нажмите **Models** в боковой панели.
2. Добавьте провайдера (имя / API URL / API Key).
3. Нажмите **Fetch models**, чтобы получить список доступных моделей.
4. Вернитесь к чату и начните общение.

---

<p align="center">
  <img src="assets/architecture.svg" width="100%" alt="AetherAI Architecture Overview">
</p>

---

## 🤝 Благодарности

AetherAI стоит на плечах этих проектов — их идеи сформировали архитектуру и UX:

- [Claude Code](https://github.com/anthropics/claude-code) — модель разрешений агента, ползунок усиления размышления, визуализация вызовов инструментов, пустое состояние нового чата.
- [Continue](https://github.com/continuedev/continue) — декларативный подход «конфиг как источник истины», абстракция провайдеров, протокол вызова функций.
- [Dify](https://github.com/langgen/dify) — паттерны нормализации мультиформатных провайдеров.
- [Model Context Protocol](https://modelcontextprotocol.io) — спецификация MCP, на которой говорит агент AetherAI.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — методология копируемых компонентов cn() / cva.
- [Magic UI](https://github.com/magicuidesign/magicui) — паттерны анимации (потоковый текст, мерцание, blur-fade).
- [new-api](https://github.com/QuantumNous/new-api) — эталон преобразования reasoning-effort при ретрансляции.
- [OpenClaw](https://github.com/openclaw/openclaw) — доработка README и вдохновение для онбординга.
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

---

## 📄 Лицензия

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
