// ───────────────────────────────────────────────────────────────────────────
// Gateway — multi-channel agent control (P2-2).
//
// Allows controlling the same agent from multiple messaging platforms:
//   - Web (HTTP webhook / WebSocket)
//   - Telegram (bot API)
//   - Discord (bot API)
//   - CLI (local terminal)
//
// Architecture:
//   Channel (interface) → Gateway (manager) → Agent (execution)
//
// Each channel:
//   - Receives messages from its platform
//   - Normalizes to a standard message format
//   - Routes to the agent via the gateway
//   - Sends the agent's reply back to the platform
//
// The gateway maintains a session per channel+user so conversations
// are isolated per platform but share the same agent core.
// ───────────────────────────────────────────────────────────────────────────

const { runAgent } = require('../llm/agentCore')
const { openDatabase, resolveProviderModel } = require('../llm/agentCore')
const log = require('../logger')

// ── Channel interface ─────────────────────────────────────────────────────

class Channel {
  constructor(config, gateway) {
    this.config = config
    this.gateway = gateway
    this.status = 'disconnected'
  }

  async start() { throw new Error('Channel.start() not implemented') }
  async stop() { throw new Error('Channel.stop() not implemented') }
  async send(recipientId, message) { throw new Error('Channel.send() not implemented') }
  normalizeMessage(raw) { return { userId: 'anonymous', text: String(raw), timestamp: Date.now() } }
}

// ── Webhook Channel (HTTP-based, for testing / custom integrations) ───────

class WebhookChannel extends Channel {
  constructor(config, gateway) {
    super(config, gateway)
    this.port = config.port || 3080
    this.secret = config.secret || ''
    this.server = null
  }

  async start() {
    const http = require('http')
    this.server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (this.secret && data.secret !== this.secret) {
              res.writeHead(401); res.end('Unauthorized'); return
            }
            const msg = this.normalizeMessage(data)
            this.gateway.handleMessage(this, msg)
            res.writeHead(200); res.end('OK')
          } catch (e) {
            res.writeHead(400); res.end('Bad Request')
          }
        })
      } else if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200); res.end(JSON.stringify({ status: 'ok', channel: 'webhook' }))
      } else {
        res.writeHead(404); res.end('Not Found')
      }
    })
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, err => {
        if (err) reject(err)
        else { this.status = 'connected'; resolve() }
      })
    })
  }

  async stop() {
    if (this.server) { this.server.close(); this.status = 'disconnected' }
  }

  async send(recipientId, message) {
    // Webhook channel: POST to a callback URL if configured
    if (this.config.callbackUrl) {
      try {
        const http = require('http')
        const data = JSON.stringify({ recipientId, message })
        const url = new URL(this.config.callbackUrl)
        const req = http.request({
          hostname: url.hostname, port: url.port, path: url.pathname,
          method: 'POST', headers: { 'Content-Type': 'application/json' },
        }, () => {})
        req.write(data); req.end()
      } catch (e) { log.warn('Webhook send failed:', e.message) }
    }
  }

  normalizeMessage(raw) {
    return {
      userId: raw.userId || raw.chatId || 'anonymous',
      text: raw.text || raw.message || JSON.stringify(raw),
      timestamp: raw.timestamp || Date.now(),
      platform: 'webhook',
    }
  }
}

// ── Telegram Channel (stub — requires bot token) ─────────────────────────

class TelegramChannel extends Channel {
  constructor(config, gateway) {
    super(config, gateway)
    this.token = config.token || ''
    this.polling = null
  }

  async start() {
    if (!this.token) { log.warn('Telegram: no token configured'); return }
    // In production: use node-telegram-bot-api or grammY
    // For now, mark as connected (polling would be implemented here)
    this.status = 'connected'
    log.info(`Telegram channel started (token: ${this.token.slice(0, 8)}...)`)
  }

  async stop() {
    if (this.polling) { clearInterval(this.polling); this.polling = null }
    this.status = 'disconnected'
  }

  async send(recipientId, message) {
    if (!this.token) return
    // In production: use Telegram Bot API
    log.info(`Telegram send to ${recipientId}: ${message.slice(0, 100)}`)
  }

  normalizeMessage(raw) {
    return {
      userId: String(raw.from?.id || raw.chat?.id || 'anonymous'),
      text: raw.text || raw.body || JSON.stringify(raw),
      timestamp: raw.date || Date.now(),
      platform: 'telegram',
    }
  }
}

// ── Discord Channel (stub — requires bot token) ──────────────────────────

class DiscordChannel extends Channel {
  constructor(config, gateway) {
    super(config, gateway)
    this.token = config.token || ''
    this.client = null
  }

  async start() {
    if (!this.token) { log.warn('Discord: no token configured'); return }
    // In production: use discord.js
    this.status = 'connected'
    log.info(`Discord channel started (token: ${this.token.slice(0, 8)}...)`)
  }

  async stop() {
    if (this.client) { /* client.destroy() */ }
    this.status = 'disconnected'
  }

  async send(recipientId, message) {
    if (!this.token) return
    log.info(`Discord send to ${recipientId}: ${message.slice(0, 100)}`)
  }

  normalizeMessage(raw) {
    return {
      userId: raw.author?.id || raw.userId || 'anonymous',
      text: raw.content || raw.text || JSON.stringify(raw),
      timestamp: raw.createdTimestamp || Date.now(),
      platform: 'discord',
    }
  }
}

// ── Gateway Manager ───────────────────────────────────────────────────────

class Gateway {
  constructor() {
    this.channels = new Map()  // name → Channel
    this.sessions = new Map()   // channel:userId → sessionId
    this.config = {}
  }

  loadConfig(db) {
    try {
      const row = db.getSetting('gateway.config')
      if (row) this.config = JSON.parse(row)
    } catch {}
  }

  saveConfig(db) {
    try {
      db.setSetting('gateway.config', JSON.stringify(this.config))
    } catch {}
  }

  addChannel(name, type, config) {
    if (this.channels.has(name)) throw new Error(`Channel ${name} already exists`)
    const channel = type === 'webhook' ? new WebhookChannel(config, this)
      : type === 'telegram' ? new TelegramChannel(config, this)
      : type === 'discord' ? new DiscordChannel(config, this)
      : null
    if (!channel) throw new Error(`Unknown channel type: ${type}`)
    this.channels.set(name, channel)
    return channel
  }

  async startChannel(name) {
    const channel = this.channels.get(name)
    if (!channel) throw new Error(`Channel ${name} not found`)
    await channel.start()
    return channel
  }

  async stopChannel(name) {
    const channel = this.channels.get(name)
    if (!channel) return
    await channel.stop()
  }

  async stopAll() {
    for (const [name, ch] of this.channels) {
      try { await ch.stop() } catch {}
    }
  }

  async handleMessage(channel, msg) {
    const key = `${channel.constructor.name}:${msg.userId}`
    let sessionId = this.sessions.get(key)

    if (!sessionId) {
      // Create new session for this channel+user
      try {
        const db = this.config.db
        if (db) {
          const info = db.createSession({ title: `${msg.platform}:${msg.userId}`, persona_id: null })
          sessionId = info?.lastInsertRowid || info
          this.sessions.set(key, sessionId)
        }
      } catch {}
    }

    // Route to agent
    const db = this.config.db
    if (!db || !sessionId) return

    const providerModel = resolveProviderModel(db, this.config.provider || {})
    if (!providerModel) return

    try {
      const result = await runAgent({
        prompt: msg.text,
        provider: providerModel.provider,
        model: providerModel.model,
        agentMode: this.config.agentMode || 'auto',
        workspace: this.config.workspace,
        sessionId,
        db,
      })

      // Send reply back to channel
      await channel.send(msg.userId, result.text || '(no response)')
    } catch (e) {
      await channel.send(msg.userId, `Error: ${e.message}`)
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

const gateway = new Gateway()

module.exports = { Gateway, gateway, Channel, WebhookChannel, TelegramChannel, DiscordChannel }
