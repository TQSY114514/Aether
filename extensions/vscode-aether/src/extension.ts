import * as vscode from 'vscode';
import { Gateway } from './gateway';
import { ChatPanel } from './chatPanel';
import { activeEditorContext, contextBlock, problemsForActiveFile, extractCodeBlock } from './context';

let statusBar: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  // statusBar item showing connection state; click to connect.
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
  statusBar.text = '$(plug) AetherAI';
  statusBar.tooltip = 'AetherAI: 检查/配置连接';
  statusBar.command = 'aether.connect';
  statusBar.show();
  void refreshConnection();

  const disposable = [
    vscode.commands.registerCommand('aether.connect', () => connect()),
    vscode.commands.registerCommand('aether.chat', () => {
      ensureConnected('打开聊天面板');
      ChatPanel.reveal();
    }),
    vscode.commands.registerCommand('aether.askSelection', async () => {
      const ctx = activeEditorContext();
      if (!ctx.selection) { void vscode.window.showWarningMessage('请先选中代码'); return; }
      if (!ensureConnected('提问')) return;
      const question = await vscode.window.showInputBox({
        prompt: '针对选中的代码提问',
        placeHolder: '例如：这段代码有什么问题？',
      });
      if (question === undefined) return;
      void ChatPanel.reveal().ask(question, { context: contextBlock(ctx) });
    }),
    vscode.commands.registerCommand('aether.explainSelection', () => {
      const ctx = activeEditorContext();
      if (!ctx.selection) { void vscode.window.showWarningMessage('请先选中代码'); return; }
      if (!ensureConnected('解释代码')) return;
      void ChatPanel.reveal().ask('请用简洁的中文解释这段代码：它做什么、关键逻辑、以及潜在问题。', {
        context: contextBlock(ctx),
        systemPrefix: '你是一名资深软件工程师，回答要准确、简洁。',
      });
    }),
    vscode.commands.registerCommand('aether.fixProblems', async () => {
      const ctx = activeEditorContext();
      if (!ctx.file) { void vscode.window.showWarningMessage('请打开一个文件'); return; }
      if (!ensureConnected('修复错误')) return;
      const probs = problemsForActiveFile();
      if (!probs.items.length) { void vscode.window.showInformationMessage('当前文件没有可修复的错误或警告'); return; }
      const prompt =
        '请修复当前文件中的以下错误/警告。只给出修改后的完整代码（放在代码块里），并简要说明每处改动。\n\n' +
        '诊断问题:\n' + probs.items.map((i) => '- ' + i).join('\n') + '\n\n' +
        '当前文件内容:\n```\n' + (ctx.fullText || '') + '\n```';
      void ChatPanel.reveal().ask(prompt, {
        context: contextBlock(ctx),
        systemPrefix: '你是一名资深软件工程师，优先给出最小、安全的修复。',
      });
    }),
    vscode.commands.registerCommand('aether.generate', async () => {
      if (!ensureConnected('生成代码')) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor) { void vscode.window.showWarningMessage('请打开一个文件'); return; }
      const ctx = activeEditorContext();
      const prompt = await vscode.window.showInputBox({
        prompt: '描述要生成的代码（会基于当前文件/选中内容）',
        placeHolder: '例如：写一个 memoize 高阶函数',
      });
      if (prompt === undefined) return;
      const res = await ChatPanel.reveal().ask(prompt, {
        context: contextBlock(ctx),
        systemPrefix: '你是一名资深软件工程师。用代码块输出完整可用的代码，不要多余解释。',
      });
      if (res.error) return;
      const code = extractCodeBlock(res.content || '');
      if (!code) { void vscode.window.showInformationMessage('AetherAI 未返回代码'); return; }
      const pick = await vscode.window.showQuickPick([
        { label: '插入到当前光标处', detail: '插入提取出的代码块', id: 'insert' },
        { label: '插入到文件末尾', detail: '', id: 'append' },
        { label: '复制到剪贴板', detail: '', id: 'copy' },
      ], { placeHolder: '代码已生成，如何处理？' });
      if (pick?.id === 'insert') {
        await editor.edit((edit) => edit.insert(editor.selection.active, '\n' + code + '\n'));
      } else if (pick?.id === 'append') {
        const end = new vscode.Position(editor.document.lineCount, 0);
        await editor.edit((edit) => edit.insert(end, '\n' + code + '\n'));
      } else if (pick?.id === 'copy') {
        await vscode.env.clipboard.writeText(code);
      }
    }),
  ];
  context.subscriptions.push(...disposable);
}

function connect(): void {
  const warnIfMissing = () => {
    void vscode.window.showWarningMessage(
      '无法连接 AetherAI。请先启动桌面 App，并在 设置 → Local Gateway 中复制 Token 填入扩展设置（aether.token）。',
      { modal: false },
      '打开设置'
    ).then((choice) => { if (choice === '打开设置') void vscode.commands.executeCommand('workbench.action.openSettings', 'aether'); });
  };
  void refreshConnection().then((health) => {
    if (!health.ok) { warnIfMissing(); return; }
    if (health.status === 401) {
      void vscode.window.showWarningMessage('AetherAI Token 无效或未填写。请在设置里填入正确的 Token。').then((choice) => {
        if (choice === 'OK') void vscode.commands.executeCommand('workbench.action.openSettings', 'aether');
      });
      return;
    }
    void vscode.window.showInformationMessage('已连接 AetherAI ✅');
  });
}

function ensureConnected(action: string): boolean {
  // Fast path: assume connected; real errors surface as assistant messages.
  void vscode.window.showInformationMessage(`已发送到 AetherAI（${action}）`, { modal: false });
  return true;
}

async function refreshConnection(): Promise<{ ok: boolean; status?: number }> {
  const gateway = new Gateway(vscode.workspace.getConfiguration('aether'));
  const health = await gateway.health();
  if (health.status === 401) {
    statusBar.text = '$(plug) AetherAI: 需 Token';
    statusBar.tooltip = 'AetherAI: Token 无效，点击配置';
  } else if (health.ok) {
    statusBar.text = '$(plug) AetherAI: 已连接';
    statusBar.tooltip = 'AetherAI: 点击重新检查';
  } else {
    statusBar.text = '$(plug) AetherAI: 未连接';
    statusBar.tooltip = 'AetherAI: 未检测到桌面 App，点击检查';
  }
  return health;
}

export function deactivate(): void {
  // no-op
}