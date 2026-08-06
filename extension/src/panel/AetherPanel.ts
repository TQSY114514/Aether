// AetherPanel — hosts the chat Webview and drives the Aether CLI child process.
// Each user prompt spawns `node <cli> <prompt> --workspace <ws> --json-lines`
// and forwards the NDJSON event stream to the Webview.

import * as vscode from 'vscode'
import * as child from 'child_process'
import * as path from 'path'

export class AetherPanel {
  private panel: vscode.WebviewPanel
  private proc: child.ChildProcessWithoutNullStreams | undefined

  constructor(
    private cliPath: string,
    private workspace: string,
    private model: string | undefined,
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
    }
  }

  private buildArgs(prompt: string): string[] {
    const args = [this.cliPath, prompt, '--workspace', this.workspace, '--mode', 'auto', '--json-lines']
    if (this.model) args.push('--model', this.model)
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
      this.post({ type: 'event', event: ev })
    } catch { /* ignore partial / malformed lines */ }
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