// ───────────────────────────────────────────────────────────────────────────
// Aether Agent Browser Environment (Web ACI & Autonomous Validation)
//
// Provides a controlled, persistent, session-based Chromium browser instance
// for the agent to navigate modern web apps (SPAs), interact with UI elements,
// extract accessibility/DOM snapshots, and inspect runtime console/network errors.
//
// Key capabilities:
//   - open: Navigate to URL (with SSRF & policy guards; localhost allowed for dev testing)
//   - snapshot: Structured interactive element tree (@1, @2) + console logs + optional screenshot
//   - click: Click element by semantic ref (@id) or CSS selector
//   - type: Focus element, set value, dispatch input/change/submit synthetic events
//   - scroll: Scroll up, down, top, bottom
//   - console: Extract page warnings, errors, and uncaught exceptions
//   - close: Release window resources
//
// Zero external browser download required: leverages Electron's bundled Chromium.
// ───────────────────────────────────────────────────────────────────────────

const path = require('path')
const fs = require('fs')
const net = require('net')
const { checkSSRF, checkSSRFHostname, isPrivateIP, stripIpBrackets } = require('../tools/ssrf')

// Safe electron resolution: falls back gracefully in pure Node.js / CLI test runners
let electron = null
try {
  electron = require('electron')
} catch {
  // Headless / non-electron environment
}

// In-memory sessions: sessionId -> AgentBrowserSession
const activeSessions = new Map()

// Inactivity timeout: 10 minutes
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Validate navigation destinations for the Agent Browser.
 * Distinguishes developer localhost testing from dangerous cloud metadata endpoints.
 */
async function isBrowserNavigationAllowed(destUrl, ctx, { allowLocalhost = true } = {}) {
  let u
  try {
    u = new URL(destUrl)
  } catch {
    return { ok: false, reason: 'invalid url' }
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol: ${u.protocol}` }
  }

  const hostname = stripIpBrackets(u.hostname).toLowerCase()

  // Always block AWS/GCP/Azure cloud metadata endpoints and internal metadata
  if (
    hostname === '169.254.169.254' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.meta') ||
    hostname.endsWith('.amazonaws.com') ||
    hostname.endsWith('metadata.google.internal')
  ) {
    return { ok: false, reason: 'blocked: cloud metadata endpoint' }
  }

  // Developer localhost allowance
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0'
  if (isLocal) {
    if (allowLocalhost) return { ok: true }
    return { ok: false, reason: 'blocked: localhost navigation disabled' }
  }

  // Check network policy if configured in DB
  if (ctx?.db) {
    try {
      const { policyActive, checkUrlPolicy } = require('../llm/networkPolicy')
      if (policyActive(ctx.db)) {
        const pol = checkUrlPolicy(ctx.db, destUrl)
        if (!pol.ok) return { ok: false, reason: `network policy: ${pol.reason || 'blocked'}` }
      }
    } catch {
      // networkPolicy module optional
    }
  }

  // Standard SSRF check for external hosts
  const ssrf = checkSSRF(destUrl)
  if (!ssrf.ok) return ssrf

  try {
    await checkSSRFHostname(u.hostname)
  } catch (err) {
    return { ok: false, reason: `dns check failed: ${err.message}` }
  }

  return { ok: true }
}

/**
 * AgentBrowserSession manages a single BrowserWindow and its interactive DOM state.
 */
class AgentBrowserSession {
  constructor(sessionId) {
    this.sessionId = sessionId
    this.win = null
    this.consoleLogs = []
    this.currentUrl = ''
    this.currentTitle = ''
    this.lastActivity = Date.now()
    this.lastThumbnail = null
    this.idleTimer = null
    this._resetIdleTimer()
  }

  _resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.close()
    }, SESSION_IDLE_TIMEOUT_MS)
  }

  touch() {
    this.lastActivity = Date.now()
    this._resetIdleTimer()
  }

  ensureWindow(ctx) {
    if (this.win && !this.win.isDestroyed()) {
      return this.win
    }

    if (!electron || typeof electron.BrowserWindow !== 'function') {
      throw new Error('agent_browser unavailable: requires Electron desktop environment')
    }

    this.win = new electron.BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        partition: `persist:agent_browser_${this.sessionId || 'default'}`,
        offscreen: true,
        sandbox: true,
        backgroundThrottling: false,
        contextIsolation: false, // enables evaluating DOM scripts and synthetic events
      },
    })

    // Capture console output
    this.win.webContents.on('console-message', (details) => {
      const d = details && typeof details === 'object' ? details : {}
      const level = typeof d.level === 'number'
        ? (['debug', 'info', 'warning', 'error'][d.level] || 'info')
        : typeof d.level === 'string' ? d.level : 'info'
      const message = String(d.message || '').slice(0, 500)
      if (message && this.consoleLogs.length < 50) {
        this.consoleLogs.push({
          level,
          message,
          line: d.lineNumber || 0,
          url: String(d.sourceId || ''),
          timestamp: Date.now(),
        })
      }
    })

    // Intercept redirects and in-page navigation for security
    this.win.webContents.on('will-redirect', async (event, navigationUrl) => {
      const allowed = await isBrowserNavigationAllowed(navigationUrl, ctx)
      if (!allowed.ok) event.preventDefault()
    })
    this.win.webContents.on('will-navigate', async (event, navigationUrl) => {
      const allowed = await isBrowserNavigationAllowed(navigationUrl, ctx)
      if (!allowed.ok) event.preventDefault()
    })

    return this.win
  }

  async navigate(url, waitMs = 1500, ctx) {
    this.touch()
    const allowed = await isBrowserNavigationAllowed(url, ctx)
    if (!allowed.ok) {
      throw new Error(`Navigation blocked: ${allowed.reason}`)
    }

    const win = this.ensureWindow(ctx)

    // Abort controller integration
    if (ctx?.signal?.aborted) throw new Error('aborted')
    const abortHandler = () => {
      try {
        if (win && !win.isDestroyed()) win.webContents.stop()
      } catch {}
    }
    if (ctx?.signal) ctx.signal.addEventListener('abort', abortHandler, { once: true })

    try {
      await win.loadURL(url, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Aether/1.0 Chrome/120.0.0.0 Safari/537.36',
      })

      if (waitMs > 0) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, Math.min(waitMs, 15000))
          if (ctx?.signal) {
            ctx.signal.addEventListener('abort', () => {
              clearTimeout(t)
              reject(new Error('aborted'))
            }, { once: true })
          }
        })
      }
    } finally {
      if (ctx?.signal) ctx.signal.removeEventListener('abort', abortHandler)
    }

    this.currentUrl = win.webContents.getURL()
    this.currentTitle = win.webContents.getTitle()
    return { url: this.currentUrl, title: this.currentTitle }
  }

  async getSnapshot({ captureScreenshot = false } = {}, ctx) {
    this.touch()
    const win = this.ensureWindow(ctx)

    // DOM interactive scanner script (Set-of-Marks / Accessibility tree)
    const scanScript = `
      (() => {
        window.__aether_refs = window.__aether_refs || {};
        window.__aether_refs = {};

        function isVisible(el) {
          if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }

        const interactiveTags = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'];
        const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 'searchbox', 'combobox', 'tab', 'menuitem'];
        const all = Array.from(document.querySelectorAll('*'));
        const candidates = [];

        for (const el of all) {
          if (!isVisible(el)) continue;
          const tag = el.tagName;
          const role = el.getAttribute('role') || '';
          const onclick = el.getAttribute('onclick');
          const tabindex = el.getAttribute('tabindex');
          const isInteractive = interactiveTags.includes(tag) ||
            interactiveRoles.includes(role) ||
            onclick !== null ||
            (tabindex !== null && tabindex !== '-1') ||
            el.getAttribute('contenteditable') === 'true';

          if (isInteractive) {
            candidates.push(el);
          }
        }

        // Drop nested interactives (e.g. keep button, drop inner span)
        const filtered = [];
        for (const el of candidates) {
          let p = el.parentElement;
          let isNested = false;
          while (p) {
            if (candidates.includes(p) && (p.tagName === 'BUTTON' || p.tagName === 'A')) {
              isNested = true;
              break;
            }
            p = p.parentElement;
          }
          if (!isNested) filtered.push(el);
        }

        let refIndex = 0;
        const items = [];
        for (const el of filtered.slice(0, 100)) {
          refIndex++;
          const refId = String(refIndex);
          el.setAttribute('data-aether-ref', refId);
          window.__aether_refs[refId] = el;

          const tag = el.tagName.toLowerCase();
          const type = el.getAttribute('type') || '';
          const name = el.getAttribute('name') || '';
          const placeholder = el.getAttribute('placeholder') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50);
          const href = el.getAttribute('href') || '';
          const value = (tag === 'input' || tag === 'textarea' || tag === 'select') ? String(el.value || '').slice(0, 50) : '';

          let repr = '[@' + refId + '] <' + tag;
          if (type) repr += ' type="' + type + '"';
          if (name) repr += ' name="' + name + '"';
          if (placeholder) repr += ' placeholder="' + placeholder + '"';
          if (ariaLabel) repr += ' aria-label="' + ariaLabel + '"';
          if (value) repr += ' value="' + value + '"';
          repr += '>';
          if (text) repr += ' "' + text + '"';
          if (href && href !== '#' && !href.startsWith('javascript:')) repr += ' -> ' + href.slice(0, 60);

          items.push(repr);
        }

        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .filter(isVisible)
          .slice(0, 8)
          .map(h => h.tagName.toLowerCase() + ': "' + (h.innerText || '').trim().slice(0, 60) + '"');

        return {
          title: document.title,
          url: window.location.href,
          headings,
          elements: items,
          totalInteractive: filtered.length
        };
      })()
    `

    let domData
    try {
      domData = await win.webContents.executeJavaScript(scanScript)
    } catch (err) {
      domData = {
        title: win.webContents.getTitle(),
        url: win.webContents.getURL(),
        headings: [],
        elements: [],
        totalInteractive: 0,
        error: err.message,
      }
    }

    this.currentUrl = domData.url || win.webContents.getURL()
    this.currentTitle = domData.title || win.webContents.getTitle()

    // Capture screenshot if requested or available
    let b64Image = null
    try {
      const img = await win.webContents.capturePage()
      if (!img.isEmpty()) {
        const inlineSize = 640
        const scale = Math.min(1, inlineSize / Math.max(img.getSize().width, img.getSize().height))
        const thumb = scale < 1 ? img.resize({ width: Math.round(img.getSize().width * scale) }) : img
        b64Image = thumb.toPNG().toString('base64')
        this.lastThumbnail = b64Image
      }
    } catch {}

    return {
      domData,
      consoleLogs: [...this.consoleLogs],
      screenshotBase64: captureScreenshot ? b64Image : null,
    }
  }

  async click({ ref, selector, waitMs = 500 }, ctx) {
    this.touch()
    const win = this.ensureWindow(ctx)

    const cleanRef = ref ? String(ref).replace(/^@/, '') : null
    const clickScript = `
      (() => {
        const refId = ${JSON.stringify(cleanRef)};
        const sel = ${JSON.stringify(selector || null)};
        let el = null;

        if (refId) {
          el = window.__aether_refs ? window.__aether_refs[refId] : null;
          if (!el) el = document.querySelector('[data-aether-ref="' + refId + '"]');
        }
        if (!el && sel) {
          el = document.querySelector(sel);
        }

        if (!el) return { success: false, error: 'Element not found (ref: ' + refId + ', selector: ' + sel + ')' };

        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.focus();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();

        return {
          success: true,
          tagName: el.tagName,
          text: (el.innerText || el.textContent || '').trim().slice(0, 50)
        };
      })()
    `

    const res = await win.webContents.executeJavaScript(clickScript)
    if (waitMs > 0) {
      await new Promise(r => setTimeout(r, Math.min(waitMs, 5000)))
    }

    this.currentUrl = win.webContents.getURL()
    this.currentTitle = win.webContents.getTitle()
    return res
  }

  async type({ ref, selector, text = '', clear = true, pressEnter = false, waitMs = 500 }, ctx) {
    this.touch()
    const win = this.ensureWindow(ctx)

    const cleanRef = ref ? String(ref).replace(/^@/, '') : null
    const typeScript = `
      (() => {
        const refId = ${JSON.stringify(cleanRef)};
        const sel = ${JSON.stringify(selector || null)};
        const textVal = ${JSON.stringify(String(text))};
        const shouldClear = ${Boolean(clear)};
        const shouldEnter = ${Boolean(pressEnter)};
        let el = null;

        if (refId) {
          el = window.__aether_refs ? window.__aether_refs[refId] : null;
          if (!el) el = document.querySelector('[data-aether-ref="' + refId + '"]');
        }
        if (!el && sel) {
          el = document.querySelector(sel);
        }

        if (!el) return { success: false, error: 'Element not found (ref: ' + refId + ', selector: ' + sel + ')' };

        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.focus();

        if (shouldClear) {
          el.value = '';
        }
        el.value = (shouldClear ? '' : (el.value || '')) + textVal;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        if (shouldEnter) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          if (el.form) {
            try { el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } catch {}
          }
        }

        return {
          success: true,
          tagName: el.tagName,
          value: el.value
        };
      })()
    `

    const res = await win.webContents.executeJavaScript(typeScript)
    if (waitMs > 0) {
      await new Promise(r => setTimeout(r, Math.min(waitMs, 5000)))
    }

    this.currentUrl = win.webContents.getURL()
    this.currentTitle = win.webContents.getTitle()
    return res
  }

  async scroll({ direction = 'down', amount = 500 }, ctx) {
    this.touch()
    const win = this.ensureWindow(ctx)

    const scrollScript = `
      (() => {
        const dir = ${JSON.stringify(direction)};
        const amt = ${Number(amount) || 500};

        if (dir === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (dir === 'bottom') {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } else if (dir === 'up') {
          window.scrollBy({ top: -amt, behavior: 'smooth' });
        } else {
          window.scrollBy({ top: amt, behavior: 'smooth' });
        }

        return {
          scrollY: window.scrollY,
          scrollX: window.scrollX,
          maxScrollY: document.body.scrollHeight - window.innerHeight
        };
      })()
    `

    return await win.webContents.executeJavaScript(scrollScript)
  }

  getConsoleLogs() {
    this.touch()
    return [...this.consoleLogs]
  }

  close() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.win && !this.win.isDestroyed()) {
      try {
        this.win.destroy()
      } catch {}
    }
    this.win = null
    this.consoleLogs = []
    activeSessions.delete(this.sessionId)
  }
}

/**
 * Get or create an AgentBrowserSession for a given session.
 */
function getBrowserSession(sessionId = 'default') {
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, new AgentBrowserSession(sessionId))
  }
  return activeSessions.get(sessionId)
}

/**
 * Close an active session if one exists.
 */
function closeBrowserSession(sessionId = 'default') {
  if (activeSessions.has(sessionId)) {
    activeSessions.get(sessionId).close()
    return true
  }
  return false
}

/**
 * Close all active sessions (e.g. on app shutdown).
 */
function closeAllSessions() {
  for (const session of activeSessions.values()) {
    session.close()
  }
  activeSessions.clear()
}

/**
 * Format console logs for agent output (focused on warnings/errors).
 */
function formatConsoleLogsSummary(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return ''
  const filtered = logs.filter(l => l.level === 'warning' || l.level === 'error')
  if (filtered.length === 0) return ''
  const lines = filtered.slice(-15).map(l => {
    const loc = l.line ? ` (${l.url}:${l.line})` : ''
    return `[${l.level.toUpperCase()}] ${l.message}${loc}`
  })
  return '\n\nConsole Warnings/Errors:\n' + lines.join('\n')
}

/**
 * Execute an agent browser action.
 */
async function executeBrowserAction(sessionId, args = {}, ctx = {}) {
  const action = String(args.action || '').trim().toLowerCase()
  if (!action) {
    throw new Error('Action required. Supported actions: open, snapshot, click, type, scroll, console, close')
  }

  const session = getBrowserSession(sessionId)

  if (action === 'close') {
    closeBrowserSession(sessionId)
    return 'Agent browser session closed.'
  }

  if (action === 'open') {
    const url = String(args.url || '').trim()
    if (!url) throw new Error('url parameter is required for action: open')
    const navResult = await session.navigate(url, args.waitMs || 1500, ctx)
    const snap = await session.getSnapshot({ captureScreenshot: Boolean(args.captureScreenshot) }, ctx)

    const headingsText = snap.domData.headings.length ? '\nHeadings:\n  ' + snap.domData.headings.join('\n  ') : ''
    const elementsText = snap.domData.elements.length
      ? '\nInteractive Elements (' + snap.domData.elements.length + '):\n  ' + snap.domData.elements.join('\n  ')
      : '\nNo interactive elements found.'
    const consoleText = formatConsoleLogsSummary(snap.consoleLogs)

    const textOutput = `Opened ${navResult.url}\nTitle: "${navResult.title}"${headingsText}${elementsText}${consoleText}`

    if (snap.screenshotBase64) {
      return [
        { type: 'text', text: textOutput },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${snap.screenshotBase64}` } },
      ]
    }
    return textOutput
  }

  if (action === 'snapshot') {
    const snap = await session.getSnapshot({ captureScreenshot: Boolean(args.captureScreenshot) }, ctx)
    const headingsText = snap.domData.headings.length ? '\nHeadings:\n  ' + snap.domData.headings.join('\n  ') : ''
    const elementsText = snap.domData.elements.length
      ? '\nInteractive Elements (' + snap.domData.elements.length + '):\n  ' + snap.domData.elements.join('\n  ')
      : '\nNo interactive elements found.'
    const consoleText = formatConsoleLogsSummary(snap.consoleLogs)

    const textOutput = `Page Snapshot: ${snap.domData.url}\nTitle: "${snap.domData.title}"${headingsText}${elementsText}${consoleText}`

    if (snap.screenshotBase64) {
      return [
        { type: 'text', text: textOutput },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${snap.screenshotBase64}` } },
      ]
    }
    return textOutput
  }

  if (action === 'click') {
    if (!args.ref && !args.selector) {
      throw new Error('ref (e.g. "@1") or selector is required for action: click')
    }
    const res = await session.click({ ref: args.ref, selector: args.selector, waitMs: args.waitMs || 500 }, ctx)
    if (!res.success) {
      return `[click failed: ${res.error}]`
    }
    return `Clicked <${res.tagName}> "${res.text}". Current URL: ${session.currentUrl} ("${session.currentTitle}")`
  }

  if (action === 'type') {
    if (!args.ref && !args.selector) {
      throw new Error('ref (e.g. "@1") or selector is required for action: type')
    }
    const res = await session.type({
      ref: args.ref,
      selector: args.selector,
      text: args.text || '',
      clear: args.clear !== false,
      pressEnter: Boolean(args.pressEnter),
      waitMs: args.waitMs || 500,
    }, ctx)
    if (!res.success) {
      return `[type failed: ${res.error}]`
    }
    return `Typed into <${res.tagName}> (value: "${res.value}"). Current URL: ${session.currentUrl}`
  }

  if (action === 'scroll') {
    const res = await session.scroll({ direction: args.direction || 'down', amount: args.amount || 500 }, ctx)
    return `Scrolled ${args.direction || 'down'} (scrollY: ${res.scrollY}px / max: ${res.maxScrollY}px)`
  }

  if (action === 'console') {
    const logs = session.getConsoleLogs()
    if (!logs.length) return 'No console logs captured.'
    const summary = logs.map(l => `[${l.level.toUpperCase()}] ${l.message} (${l.url}:${l.line})`).join('\n')
    return `Console logs (${logs.length} entries):\n${summary}`
  }

  throw new Error(`Unknown action: "${action}". Supported actions: open, snapshot, click, type, scroll, console, close`)
}

/**
 * Get current state of an active session (for UI preview / IPC).
 */
function getBrowserStatus(sessionId = 'default') {
  const session = activeSessions.get(sessionId)
  if (!session || !session.win || session.win.isDestroyed()) {
    return { active: false }
  }
  return {
    active: true,
    url: session.currentUrl,
    title: session.currentTitle,
    lastActivity: session.lastActivity,
    hasThumbnail: Boolean(session.lastThumbnail),
    thumbnailBase64: session.lastThumbnail,
    consoleWarningErrorCount: session.consoleLogs.filter(l => l.level === 'warning' || l.level === 'error').length,
  }
}

module.exports = {
  getBrowserSession,
  closeBrowserSession,
  closeAllSessions,
  executeBrowserAction,
  getBrowserStatus,
  isBrowserNavigationAllowed,
}
