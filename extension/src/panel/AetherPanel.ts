// AetherPanel — hosts the chat Webview and drives the Aether CLI child process.
// Each user prompt spawns `node <cli> <prompt> --workspace <ws> --json-lines`
// and forwards the NDJSON event stream to the Webview.

import * as vscode from 'vscode'
import * as child from 'child_process'
import * as path from 'path'

// File-writing tools whose args let the extension rebuild the *new* content,
// diff it against what was on disk, and offer a one-click revert.
const WRITE_TOOL_NAMES = new Set(['write_file', 'edit_file', 'apply_patch'])

interface FileEditSession {
  id: number
  absPath: string
  relPath: string
  name: string
  /** Content on disk at the moment the tool *started* (before the write). */
  original: string
  /** Rebuilt post-tool content; undefined when it cannot be reconstructed. */
  content?: string
}

export class AetherPanel {
  private panel: vscode.WebviewPanel
  private proc: child.ChildProcessWithoutNullStreams | undefined
  private editSessions = new Map<string, FileEditSession>()
  private nextEditId = 1

  constructor(
    private cliPath: string,
    private workspace: string,
    private model: string | undefined,
    private apiKey: string | undefined,
    private onDisposed: () => void,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'aetherChat',
      'AetherAI',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    )
    this.panel.webview.html = getWebviewHtml()
    this.panel.webview.onDidReceiveMessage((msg) => this.handle(msg))
    this.panel.onDidDispose(() => this.dispose())
    this.post({ type: 'init', model: this.model ?? '' })
  }

  // Show the panel; if a context prompt is supplied, run it immediately.
  reveal(context?: string): void {
    this.panel.reveal(vscode.ViewColumn.Beside, true)
    if (context) this.post({ type: 'run', prompt: context })
  }

  private post(obj: unknown): void {
    try { this.panel.webview.postMessage(obj) } catch { /* webview gone */ }
  }

  private handle(msg: any): void {
    switch (msg?.type) {
      case 'send': this.run(String(msg.prompt)); break
      case 'stop': this.kill(); break
      case 'insertCode': this.insertCode(String(msg.code)); break
      case 'writeFile': this.writeFile(String(msg.code), String(msg.fileName || '')); break
      case 'revertFile': void this.revertFile(String(msg.fileId)); break
      case 'openFile': void this.openFile(String(msg.fileId)); break
    }
  }

  private buildArgs(prompt: string): string[] {
    const args = [this.cliPath, prompt, '--workspace', this.workspace, '--mode', 'auto', '--json-lines']
    if (this.model) args.push('--model', this.model)
    if (this.apiKey) args.push('--api-key', this.apiKey)
    return args
  }

  private run(prompt: string): void {
    this.kill()
    this.post({ type: 'turn:start' })
    this.proc = child.spawn('node', this.buildArgs(prompt), { cwd: this.workspace })
    let buf = ''
    this.proc.stdout.setEncoding('utf-8')
    this.proc.stdout.on('data', (d) => {
      buf += d
      let nl = buf.indexOf('\n')
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) this.emitLine(line)
        nl = buf.indexOf('\n')
      }
    })
    this.proc.stderr.setEncoding('utf-8')
    this.proc.stderr.on('data', (d) => {
      this.post({ type: 'event', event: { type: 'status', kind: 'stderr', text: String(d) } })
    })
    this.proc.on('close', (code) => {
      this.proc = undefined
      this.post({ type: 'turn:end', code })
    })
    this.proc.on('error', (err) => {
      this.post({ type: 'event', event: { type: 'status', kind: 'error', text: err.message } })
    })
  }

  private emitLine(line: string): void {
    try {
      const ev = JSON.parse(line)
      if (ev.type === 'tool:start' && WRITE_TOOL_NAMES.has(ev.entry?.name)) this.captureEditStart(ev.entry)
      else if (ev.type === 'tool:end' && WRITE_TOOL_NAMES.has(ev.entry?.name)) void this.captureEditEnd(ev.entry)
      this.post({ type: 'event', event: ev })
    } catch { /* ignore partial / malformed lines */ }
  }

  // ─── Diff integration: watch file-writing tools, rebuild new content, and
  // offer Revert from the webview. Works because `tool:start` fires before the
  // CLI executes the tool — the disk content we read right then is the
  // pre-change baseline. ─────────────────────────────────────────────────────

  private sessionFor(entry: { name: string; args?: Record<string, unknown> }): FileEditSession | undefined {
    const args = entry.args || {}
    const patchPath = Array.isArray(args.patches) && typeof args.patches[0]?.path === 'string'
      ? args.patches[0].path
      : undefined
    const raw = typeof args.file_path === 'string' ? args.file_path
      : typeof args.path === 'string' ? args.path
      : typeof args.file === 'string' ? args.file
      : patchPath
    if (!raw) return undefined
    const absPath = path.isAbsolute(raw) ? raw : path.resolve(this.workspace, raw)
    let session = this.editSessions.get(absPath)
    if (!session) {
      session = {
        id: this.nextEditId++,
        absPath,
        relPath: vscode.workspace.asRelativePath(vscode.Uri.file(absPath), false),
        name: entry.name,
        original: '',
      }
      this.editSessions.set(absPath, session)
    }
    return session
  }

  /** tool:start — snapshot the on-disk content BEFORE the agent writes. */
  private captureEditStart(entry: { name: string; args?: Record<string, unknown> }): void {
    const session = this.sessionFor(entry)
    if (!session) return
    void vscode.workspace.fs.readFile(vscode.Uri.file(session.absPath)).then(
      (buf) => { session.original = Buffer.from(buf).toString('utf-8') },
      () => { session.original = '' }, // file may not exist yet (new file)
    )
  }

  /** tool:end: rebuild the post-write content and announce the diff card. */
  private async captureEditEnd(entry: { name: string; args?: Record<string, unknown>; result?: unknown; error?: unknown }): Promise<void> {
    const session = this.sessionFor(entry)
    if (!session) return
    // The start-snapshot read may still be in flight — fall back to reading now.
    if (session.original === '') {
      try {
        session.original = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(session.absPath))).toString('utf-8')
      } catch { session.original = '' } // new file
    }
    const args = entry.args || {}
    let content: string | undefined
    if (entry.name === 'write_file') {
      content = String(args.content ?? args.text ?? '')
    } else if (entry.name === 'edit_file') {
      const oldStr = String(args.old_string ?? '')
      const newStr = String(args.new_string ?? '')
      const base = session.original
      content = oldStr ? base.replace(oldStr, newStr) : base
    }
    // apply_patch: contents can't be rebuilt line-by-line reliably — the
    // session still powers the Revert button via `original`.
    session.name = entry.name
    this.post({
      type: 'file',
      fileId: String(session.id),
      name: entry.name,
      relPath: session.relPath,
      original: session.original,
      content,
      success: !entry.error,
    })
  }

  /** Revert one edited file to the pre-change snapshot captured at tool:start. */
  private async revertFile(fileId: string): Promise<void> {
    const session = [...this.editSessions.values()].find((s) => String(s.id) === fileId)
    if (!session) return
    await vscode.workspace.fs.writeFile(vscode.Uri.file(session.absPath), Buffer.from(session.original, 'utf-8'))
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(session.absPath))
    await vscode.window.showTextDocument(doc)
    this.post({ type: 'file:reverted', fileId })
  }

  private async openFile(fileId: string): Promise<void> {
    const session = [...this.editSessions.values()].find((s) => String(s.id) === fileId)
    if (!session) return
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(session.absPath))
    await vscode.window.showTextDocument(doc)
  }

  private kill(): void {
    if (this.proc) {
      try { this.proc.kill() } catch { /* already dead */ }
      this.proc = undefined
    }
  }

  private insertCode(code: string): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showInformationMessage('No active editor. Open a file to insert the code.')
      return
    }
    editor.edit((eb) => eb.insert(editor.selection.active, code))
  }

  private async writeFile(code: string, fileName: string): Promise<void> {
    const name = fileName.trim() || `aether_output_${Date.now()}.txt`
    const filePath = path.join(this.workspace, name)
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(code, 'utf-8'))
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
    await vscode.window.showTextDocument(doc)
  }

  dispose(): void {
    this.kill()
    this.panel.dispose()
    this.onDisposed()
  }
}

// ─── Webview content (inline HTML + JS, no external assets) ─────────────────

function getWebviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { color-scheme: light dark; }
  body { font-family: var(--vscode-font-family); margin: 0; display: flex; flex-direction: column; height: 100vh; }
  header { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; gap: 8px; }
  header .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-charts-green, #4caf50); }
  header .dot.busy { background: var(--vscode-charts-yellow, #ffc107); animation: pulse 1s infinite; }
  @keyframes pulse { 50% { opacity: .3; } }
  header .model { font-size: 12px; opacity: .8; }
  #log { flex: 1; overflow-y: auto; padding: 12px; }
  .msg { margin-bottom: 12px; }
  .msg .who { font-size: 11px; font-weight: 600; opacity: .6; margin-bottom: 4px; }
  .user, .assistant { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.5; }
  .tool { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin: 6px 0; padding: 6px 8px; font-size: 12px; }
  .tool .name { font-weight: 600; }
  .tool .state { opacity: .7; margin-left: 6px; }
  .tool .result { margin-top: 4px; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow-y: auto; font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: .9; }
  .tool .result.collapsed { max-height: 20px; overflow: hidden; }
  .status { font-size: 12px; opacity: .7; margin: 2px 0; }
  .status.err { color: var(--vscode-errorForeground, #e53935); }
  .code { position: relative; background: var(--vscode-textCodeBlock-background, #1e1e1e); border-radius: 6px; margin: 8px 0; }
  .code pre { margin: 0; padding: 10px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: 12px; }
  .code .actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
  .code:hover .actions { opacity: 1; }
  .code .actions button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
  .code .actions input { width: 120px; font-size: 11px; }
  .edit { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin: 6px 0; font-size: 12px; }
  .edit-head { display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .edit-name { font-weight: 600; white-space: nowrap; }
  .edit-file { opacity: .7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .edit-stats { opacity: .85; white-space: nowrap; }
  .edit-state.err { color: var(--vscode-errorForeground, #e53935); }
  .diff { max-height: 240px; overflow-y: auto; font-family: var(--vscode-editor-font-family); font-size: 11px; line-height: 1.5; }
  .dline { display: flex; gap: 6px; padding: 0 8px; white-space: pre-wrap; word-break: break-word; }
  .dline .ln { opacity: .5; min-width: 34px; text-align: right; flex-shrink: 0; }
  .dline.del { background: var(--vscode-diffEditor-removedTextBackground, rgba(248,81,73,.22)); }
  .dline.add { background: var(--vscode-diffEditor-insertedTextBackground, rgba(35,134,54,.22)); }
  .dline .g { opacity: .55; }
  .dnote { padding: 6px 8px; opacity: .8; font-size: 12px; }
  .edit-actions { display: flex; gap: 4px; padding: 4px 8px; justify-content: flex-end; }
  .edit-actions button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 2px 10px; font-size: 11px; cursor: pointer; }
  .edit-actions button.secondary { background: transparent; border: 1px solid var(--vscode-panel-border); color: var(--vscode-foreground); }
  .edit-actions button:disabled { opacity: .5; cursor: default; }
  .edit-actions .reverted { color: var(--vscode-charts-green, #4caf50); display: flex; align-items: center; font-size: 11px; padding: 2px 4px; }
  #inputbar { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--vscode-panel-border); }
  #input { flex: 1; resize: none; }
  #inputbar button { cursor: pointer; }
</style>
</head>
<body>
<header>
  <span class="dot" id="dot"></span>
  <span>AetherAI</span>
  <span class="model" id="model"></span>
</header>
<div id="log"></div>
<div id="inputbar">
  <textarea id="input" rows="2" placeholder="Ask AetherAI…"></textarea>
  <button id="send">Send</button>
  <button id="stop" disabled>Stop</button>
</div>
<script>
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  const dot = document.getElementById('dot');
  const model = document.getElementById('model');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const stopBtn = document.getElementById('stop');
  let turnEl = null; // current assistant turn root
  let textLine = null; // streaming text element
  let tools = {}; // tool:start name -> element

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function append(parent, node) { parent.appendChild(node); return node; }
  function setBusy(b) { dot.classList.toggle('busy', b); stopBtn.disabled = !b; sendBtn.disabled = b; }

  function addUser(text) {
    const m = el('div', 'msg');
    m.appendChild(el('div', 'who', 'you'));
    m.appendChild(el('div', 'user', text));
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }

  function startTurn() {
    turnEl = el('div', 'msg');
    turnEl.appendChild(el('div', 'who', 'aether'));
    textLine = el('div', 'assistant');
    turnEl.appendChild(textLine);
    log.appendChild(turnEl);
    tools = {};
    setBusy(true);
    log.scrollTop = log.scrollHeight;
  }

  function addStatus(kind, text) {
    if (!turnEl) return;
    const s = el('div', 'status' + (kind === 'error' ? ' err' : ''), text);
    turnEl.appendChild(s);
    log.scrollTop = log.scrollHeight;
  }

  function toolStart(name) {
    if (!turnEl) return;
    const t = el('div', 'tool');
    t.appendChild(el('span', 'name', name));
    t.appendChild(el('span', 'state', 'running…'));
    turnEl.appendChild(t);
    tools[name] = t;
    log.scrollTop = log.scrollHeight;
  }

  function toolEnd(entry) {
    const t = tools[entry.name];
    if (!t) return;
    const state = entry.error ? 'error' : 'done' + (entry.latencyMs != null ? ' · ' + entry.latencyMs + 'ms' : '');
    t.querySelector('.state').textContent = state;
    if (entry.error) {
      t.appendChild(el('div', 'result', String(entry.error)));
    } else if (entry.result != null) {
      const r = el('div', 'result', esc(String(entry.result)));
      if (String(entry.result).length > 300) r.classList.add('collapsed');
      r.addEventListener('click', () => r.classList.toggle('collapsed'));
      t.appendChild(r);
    }
    log.scrollTop = log.scrollHeight;
  }

  function appendText(delta) {
    if (!textLine) return;
    textLine.textContent += delta;
    log.scrollTop = log.scrollHeight;
  }

  // Parse fenced code blocks out of the final answer and attach actions.
  function addCodeBlocks(text) {
    if (!turnEl) return;
    const re = /\`\`\`(\w*)\\n([\s\S]*?)\`\`\`/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const lang = m[1] || 'txt';
      const code = m[2];
      const c = el('div', 'code');
      c.appendChild(el('pre', '', code));
      const actions = el('div', 'actions');
      const insert = el('button', null, 'Insert');
      insert.addEventListener('click', () => vscode.postMessage({ type: 'insertCode', code }));
      const fileInput = el('input', null);
      fileInput.placeholder = lang + ' file name';
      const write = el('button', null, 'Write file');
      write.addEventListener('click', () => vscode.postMessage({ type: 'writeFile', code, fileName: fileInput.value }));
      actions.append(insert, fileInput, write);
      c.appendChild(actions);
      turnEl.appendChild(c);
    }
    log.scrollTop = log.scrollHeight;
  }

  function endTurn(finalText) {
    if (turnEl) {
      if (textLine) textLine.textContent = finalText || textLine.textContent;
      addCodeBlocks(finalText || textLine.textContent);
    }
    setBusy(false);
    turnEl = null;
    textLine = null;
  }

  // ─── Diff view ───────────────────────────────────────────────────────────
  // Line-level LCS diff with a product cap; beyond that we degrade to a note.
  const DIFF_DOT = 2000000; // ~1400x1400 lines of cells — fine for real files

  function diffRows(a, b) {
    const A = String(a == null ? '' : a).split('\\n');
    const B = String(b == null ? '' : b).split('\\n');
    const n = A.length, m = B.length;
    if (n * m > DIFF_DOT) return { rows: [], stats: { add: B.length, del: n }, tooBig: true };
    const w = m + 1;
    const dp = new Int32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      const r = i * w, rn = (i + 1) * w;
      for (let j = m - 1; j >= 0; j--) {
        dp[r + j] = A[i] === B[j] ? dp[rn + j + 1] + 1 : Math.max(dp[rn + j], dp[r + j + 1]);
      }
    }
    const rows = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { rows.push({ k: 'c', t: A[i] }); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { rows.push({ k: 'd', t: A[i] }); i++; }
      else { rows.push({ k: 'a', t: B[j] }); j++; }
    }
    while (i < n) rows.push({ k: 'd', t: A[i++] });
    while (j < m) rows.push({ k: 'a', t: B[j++] });
    const stats = { add: 0, del: 0 };
    for (const r of rows) { if (r.k === 'a') stats.add++; if (r.k === 'd') stats.del++; }
    return { rows, stats, tooBig: false };
  }

  const editCards = {}; // fileId -> { card, revertBtn }

  function renderEditCard(p) {
    if (!turnEl) return;
    const card = el('div', 'edit');
    card.dataset.fileId = p.fileId;
    const head = el('div', 'edit-head');
    head.appendChild(el('span', 'edit-name', p.name));
    head.appendChild(el('span', 'edit-file', p.relPath));
    if (p.success === false) head.appendChild(el('span', 'edit-state err', 'error'));
    let body;
    if (p.content != null) {
      if (!p.original) {
        // Brand-new file (nothing on disk) — show line count instead of an
        // empty-baseline diff; Revert deletes the file back to nothing.
        const newCount = String(p.content).split('\\n').length;
        head.appendChild(el('span', 'edit-stats', '新增 ' + newCount + ' 行'));
        body = el('div', 'dnote', '新文件（工作区原本不存在）— 回滚将删除该文件。');
      } else {
        const d = diffRows(p.original, p.content);
        head.appendChild(el('span', 'edit-stats', '+' + d.stats.add + ' −' + d.stats.del + (d.tooBig ? ' (过大，省略视图)' : '')));
        body = el('div', 'diff');
        if (d.rows.length) {
          let oldLine = 0, newLine = 0;
          for (const r of d.rows) {
            const ln = el('div', 'dline ' + r.k);
            const num = el('span', 'ln', r.k === 'c' ? (oldLine + 1) + ':' + (newLine + 1) : r.k === 'd' ? (oldLine + 1) + ':' : ':' + (newLine + 1));
            ln.appendChild(num);
            ln.appendChild(el('span', 'g', r.k === 'c' ? ' ' : r.k === 'd' ? '−' : '+'));
            ln.appendChild(el('span', null, r.t));
            if (r.k === 'a') newLine++; else oldLine++;
            body.appendChild(ln);
          }
        } else {
          body.appendChild(el('div', 'dnote', '没有差异'));
        }
      }
    } else {
      body = el('div', 'dnote', 'apply_patch 已写入文件 — 内容无法逐行重建，可用“回滚”还原。');
    }
    card.appendChild(head);
    card.appendChild(body);
    const actions = el('div', 'edit-actions');
    const openBtn = el('button', null, '打开文件');
    openBtn.classList.add('secondary');
    openBtn.addEventListener('click', () => vscode.postMessage({ type: 'openFile', fileId: p.fileId }));
    const revertBtn = el('button', null, '回滚');
    revertBtn.addEventListener('click', () => {
      revertBtn.disabled = true;
      revertBtn.textContent = '回滚中…';
      vscode.postMessage({ type: 'revertFile', fileId: p.fileId });
    });
    actions.append(openBtn, revertBtn);
    card.appendChild(actions);
    turnEl.appendChild(card);
    editCards[p.fileId] = { card, revertBtn };
    log.scrollTop = log.scrollHeight;
  }

  function markReverted(fileId) {
    const rec = editCards[fileId];
    if (!rec) return;
    if (rec.revertBtn) { rec.revertBtn.disabled = true; rec.revertBtn.textContent = '已回滚'; }
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
      model.textContent = msg.model ? 'model: ' + msg.model : '';
    } else if (msg.type === 'run') {
      addUser(msg.prompt);
      startTurn();
      vscode.postMessage({ type: 'send', prompt: msg.prompt });
    } else if (msg.type === 'turn:start') {
      startTurn();
    } else if (msg.type === 'turn:end') {
      setBusy(false);
    } else if (msg.type === 'event') {
      const ev = msg.event;
      if (ev.type === 'status') addStatus(ev.kind, ev.text);
      else if (ev.type === 'plan') addStatus('plan', 'plan: ' + (ev.step && ev.step.text || JSON.stringify(ev.step)));
      else if (ev.type === 'tool:start') toolStart(ev.entry.name);
      else if (ev.type === 'tool:end') toolEnd(ev.entry);
      else if (ev.type === 'text') appendText(ev.delta);
      else if (ev.type === 'done') endTurn(ev.text);
      else if (ev.type === 'error') addStatus('error', ev.message || '');
    } else if (msg.type === 'file') {
      renderEditCard(msg);
    } else if (msg.type === 'file:reverted') {
      markReverted(msg.fileId);
    }
  });

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));

  function send() {
    const p = input.value.trim();
    if (!p) return;
    input.value = '';
    addUser(p);
    startTurn();
    vscode.postMessage({ type: 'send', prompt: p });
  }
</script>
</body>
</html>`
}

export { getWebviewHtml }