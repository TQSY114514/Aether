import * as vscode from 'vscode';

export interface EditorContext {
  file?: string;
  selection?: string;
  fullText?: string;
}

/** Snapshot of the active editor: file path, selection text, and full text. */
export function activeEditorContext(): EditorContext {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};
  const doc = editor.document;
  const sel = editor.selection;
  const selection = sel.isEmpty ? undefined : doc.getText(sel);
  return {
    file: doc.uri.fsPath,
    selection,
    fullText: doc.getText(),
  };
}

/** Human-readable context block for the model (file + optional selection). */
export function contextBlock(ctx: EditorContext): string {
  if (!ctx.file) return '';
  let out = `当前文件: ${ctx.file}`;
  if (ctx.selection) out += `\n选中代码:\n\`\`\`\n${ctx.selection}\n\`\`\``;
  return out;
}

export interface ProblemInfo {
  file?: string;
  items: string[];
}

/** Collect diagnostics (errors + warnings) for the active file. */
export function problemsForActiveFile(): ProblemInfo {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return { items: [] };
  const file = editor.document.uri.fsPath;
  const items = vscode.languages
    .getDiagnostics(editor.document.uri)
    .filter(
      (d) =>
        d.severity === vscode.DiagnosticSeverity.Error ||
        d.severity === vscode.DiagnosticSeverity.Warning
    )
    .map((d) => {
      const kind = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';
      const line = d.range.start.line + 1;
      return `[${kind}] line ${line}: ${d.message}`;
    });
  return { file, items };
}

/** Extract the first fenced code block from a model reply, if present. */
export function extractCodeBlock(text: string): string {
  const fence = text.match(/```(?:[a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/);
  if (fence && fence[1].trim()) return fence[1].trim();
  return text.trim();
}