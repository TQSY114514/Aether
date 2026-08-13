import * as vscode from 'vscode';
import { Gateway, type CompleteResult as GatewayResult } from './gateway';

let current: ChatPanel | undefined;

/**
 * A single, persistent chat panel. It keeps one `sessionId` so Aether holds
 * conversation context across turns. All top-level commands funnel into this
 * panel (askSelection / explainSelection / fixProblems seed a message, and the
 * user can keep chatting inline).
 */
export class ChatPanel {
  static reveal(): ChatPanel {
    if (current) {
      current.panel.reveal(vscode.ViewColumn.Beside);
      return current;
    }
    current = new ChatPanel();
    return current;
  }

  readonly panel: vscode.WebviewPanel;
  private gateway: Gateway;
  private sessionId: number | null = null;

  private constructor() {
    const cfg = vscode.workspace.getConfiguration('aether');
    this.gateway = new Gateway(cfg);
    this.panel = vscode.window.createWebviewPanel(
      'aetherChat',
      'Aether',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
    );
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => {
      current = undefined;
    });
    this.panel.webview.onDidReceiveMessage(async (msg: { type: string; content?: string }) => {
      if (msg.type === 'send' && msg.content) {
        await this.sendCore(msg.content);
      }
    });
  }

  /** Seed a turn with a user prompt plus optional context/system prefix. Returns the completion result. */
  async ask(prompt: string, opts?: { context?: string; systemPrefix?: string }): Promise<GatewayResult> {
    this.panel.reveal(vscode.ViewColumn.Beside);
    this.post({ type: 'user', content: prompt });
    return this.sendCore(prompt, opts);
  }

  private async sendCore(content: string, extra?: { context?: string; systemPrefix?: string }): Promise<GatewayResult> {
    this.post({ type: 'status', text: '… 思考中' });
    const res = await this.gateway.complete({
      content,
      sessionId: this.sessionId,
      context: extra?.context,
      systemPrefix: extra?.systemPrefix,
    });
    if (res.error) {
      this.post({ type: 'error', text: res.error });
      return res;
    }
    this.sessionId = res.sessionId ?? this.sessionId;
    this.post({ type: 'assistant', content: res.content || '' });
    return res;
  }

  private post(msg: unknown): void {
    this.panel.webview.postMessage(msg);
  }

  private html(): string {
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-editor-foreground, #d4d4d4);
    --border: var(--vscode-panel-border, #333);
    --accent: var(--vscode-button-background, #0e639c);
    --accent-fg: var(--vscode-button-foreground, #fff);
    --muted: var(--vscode-descriptionForeground, #9d9d9d);
    --code-bg: var(--vscode-textCodeBlock-background, #2a2a2a);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family, sans-serif); font-size: 13px; }
  #msgs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 100%; padding: 8px 10px; border-radius: 8px; line-height: 1.5; white-space: normal; overflow-wrap: break-word; }
  .msg.user { align-self: flex-end; background: var(--accent); color: var(--accent-fg); }
  .msg.assistant { align-self: stretch; background: var(--code-bg); }
  .msg.status { align-self: center; color: var(--muted); font-style: italic; padding: 2px; }
  .msg.error { align-self: stretch; color: #e51400; background: rgba(229,20,0,0.08); border: 1px solid rgba(229,20,0,0.3); }
  .msg pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; overflow-x: auto; margin: 6px 0; }
  .msg code { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  .msg :not(pre) > code { background: rgba(127,127,127,0.2); padding: 1px 4px; border-radius: 4px; }
  .msg h1, .msg h2, .msg h3, .msg h4 { margin: 8px 0 4px; }
  .msg ul, .msg ol { margin: 4px 0; padding-left: 20px; }
  .msg a { color: var(--vscode-textLink-foreground, #4daafc); }
  #inputbar { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border); }
  #box { flex: 1; background: var(--code-bg); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: var(--vscode-font-family, sans-serif); font-size: 13px; resize: none; outline: none; }
  #box:focus { border-color: var(--accent); }
  #send { background: var(--accent); color: var(--accent-fg); border: none; border-radius: 6px; padding: 0 16px; cursor: pointer; font-size: 13px; }
  #send:disabled { opacity: 0.5; cursor: default; }
</style>
</head>
<body>
<div id="msgs"></div>
<div id="inputbar">
  <textarea id="box" rows="2" placeholder="问 Aether…（Ctrl+Enter / ⊞ 发送）"></textarea>
  <button id="send">发送</button>
</div>
<script>
(function () {
  const msgs = document.getElementById('msgs');
  const box = document.getElementById('box');
  const send = document.getElementById('send');

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/[\x60]([^\x60]+)[\x60]/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  }

  function md(text) {
    const lines = String(text || '').split('\\n');
    let out = '';
    let inFence = false;
    let fenceBuf = [];
    for (const line of lines) {
      if (line.trim().startsWith('\x60\x60\x60')) {
        if (inFence) {
          out += '<pre><code>' + esc(fenceBuf.join('\\n')) + '</code></pre>';
          fenceBuf = [];
          inFence = false;
        } else { inFence = true; }
        continue;
      }
      if (inFence) { fenceBuf.push(line); continue; }
      const t = line.trim();
      if (!t) { continue; }
      if (/^#{1,4}\s/.test(t)) {
        const lvl = t.match(/^#{1,4}/)[0].length;
        out += '<h' + lvl + '>' + inline(esc(t.replace(/^#{1,4}\s*/, ''))) + '</h' + lvl + '>';
      } else if (/^[-*]\s/.test(t)) {
        out += '<li>' + inline(esc(t.replace(/^[-*]\s*/, ''))) + '</li>';
      } else {
        out += '<p>' + inline(esc(t)) + '</p>';
      }
    }
    if (inFence && fenceBuf.length) out += '<pre><code>' + esc(fenceBuf.join('\\n')) + '</code></pre>';
    return out;
  }

  function add(type, content) {
    const div = document.createElement('div');
    div.className = 'msg ' + type;
    if (type === 'assistant') div.innerHTML = md(content);
    else div.textContent = content;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function submit() {
    const v = box.value.trim();
    if (!v) return;
    add('user', v);
    box.value = '';
    send.disabled = true;
    window.acquireVsCodeApi().postMessage({ type: 'send', content: v });
  }

  send.addEventListener('click', submit);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'user') add('user', m.content);
    else if (m.type === 'assistant') { add('assistant', m.content); send.disabled = false; }
    else if (m.type === 'status') add('status', m.text);
    else if (m.type === 'error') { add('error', m.text); send.disabled = false; }
  });

  box.focus();
})();
</script>
</body>
</html>`;
  }
}