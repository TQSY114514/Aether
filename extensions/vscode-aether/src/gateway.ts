import * as vscode from 'vscode';

export interface CompleteParams {
  content: string;
  modelId?: number | null;
  sessionId?: number | null;
  context?: string;
  systemPrefix?: string;
}

export interface CompleteResult {
  content?: string;
  sessionId?: number;
  messageId?: number;
  error?: string;
}

/**
 * Thin HTTP client for AetherAI's local gateway (127.0.0.1:<port>).
 * The gateway proxies every path to the matching IPC channel, so a POST to
 * /chat:complete invokes the main-process `chat:complete` handler and returns
 * the full text synchronously. Auth is a static token via the X-AetherAI-Token
 * header (see the desktop app's Settings → Local Gateway).
 *
 * The gateway binds to 127.0.0.1 only, so this always talks to the local app.
 */
export class Gateway {
  private cfg: vscode.WorkspaceConfiguration;

  constructor(cfg: vscode.WorkspaceConfiguration) {
    this.cfg = cfg;
  }

  private baseUrl(): string {
    const host = this.cfg.get<string>('host') || 'http://127.0.0.1:35791';
    return host.replace(/\/+$/, '');
  }

  private token(): string {
    return this.cfg.get<string>('token') || '';
  }

  private headers(): Record<string, string> {
    return { 'X-AetherAI-Token': this.token() };
  }

  /** Reachability + auth check. ok=false means unreachable; status 401 means wrong/missing token. */
  async health(): Promise<{ ok: boolean; status?: number }> {
    try {
      const res = await fetch(`${this.baseUrl()}/health`, { headers: this.headers() });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false };
    }
  }

  /** Non-streaming completion. Returns the assistant text plus the session id. */
  async complete(params: CompleteParams): Promise<CompleteResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}/chat:complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        body: JSON.stringify(params),
      });
    } catch (e) {
      return { error: `无法连接 AetherAI（${this.baseUrl()}）：${(e as Error).message}` };
    }

    if (res.status === 401) {
      return { error: '认证失败：请检查 AetherAI 设置里的 Token（Settings → Local Gateway）' };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { error: `AetherAI 返回 HTTP ${res.status}${body ? `：${body}` : ''}` };
    }
    try {
      return (await res.json()) as CompleteResult;
    } catch {
      return { error: 'AetherAI 返回了无法解析的响应' };
    }
  }
}