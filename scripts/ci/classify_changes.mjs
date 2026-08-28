#!/usr/bin/env node
/**
 * classify_changes.mjs
 * 把一次 push / PR 的改动路径分类为 CI lanes，输出为 GITHUB_OUTPUT（lane=true/false）。
 *
 * 对齐 hermes-agent（NousResearch）的 detect-changes 模式：
 *  - PR：增量触发——只跑受影响的 lane，省 runner 时间
 *  - push 到主干（master/main）：fail-open 全跑——主干永远全量验证
 *
 * lanes：
 *   core     app/electron/**、app/scripts/**（主进程 / IPC 契约 / 工具脚本）
 *   renderer app/src/**（渲染层）
 *   tui      app/tui/**（独立 Ink 包）
 *   tests    app/test/**、*.test.* 与 *.spec.* 文件、evals/**
 *   deps     package.json / package-lock.json（app 与 app/tui）
 *   docs     文档、README、*.md
 *   ci       .github/**、scripts/**（CI 自身）
 *
 * 用法（本地调试）：
 *   node scripts/ci/classify_changes.mjs --base HEAD~1 --head HEAD   # stdout 打印 JSON
 * 在 GitHub Actions 中自动读取 $GITHUB_EVENT_PATH 与 $GITHUB_OUTPUT。
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const LANE_ORDER = ['core', 'renderer', 'tui', 'tests', 'deps', 'docs', 'ci'];

/** 单个路径 → lane；无法归类的代码改动按 core 处理（宁可多跑）。 */
function laneOf(p) {
  if (p.startsWith('.github/') || p.startsWith('scripts/')) return 'ci';
  if (p.startsWith('docs/') || p.startsWith('README') || /\.md$/i.test(p)) return 'docs';
  if (/package(-lock)?\.json$/i.test(p)) return 'deps';
  if (p.startsWith('app/tui/')) return 'tui';
  if (p.startsWith('app/test/') || /\.test\.|\.spec\./i.test(p) || p.startsWith('evals/')) return 'tests';
  if (p.startsWith('app/src/')) return 'renderer';
  return 'core';
}

/** git diff --name-only base...head（三点 = merge-base，PR 语义）。 */
function gitList(base, head) {
  try {
    const out = execSync(`git diff --name-only ${base}...${head}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    // base 提交不可达（如推送后 CI 首次跑）——fail-open 全跑最安全
    return null;
  }
}

function readEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (p && existsSync(p)) {
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') opt.base = args[++i];
    if (args[i] === '--head') opt.head = args[++i];
  }

  const ev = readEvent();
  const branch = ev && ev.ref ? ev.ref.replace('refs/heads/', '') : null;
  const isMain = branch === 'master' || branch === 'main';
  const isPr = ev && ev.pull_request != null;

  let files; // null 表示"全跑"
  if (opt.base && opt.head) {
    files = gitList(opt.base, opt.head);
  } else if (ev) {
    if (isPr) {
      files = gitList(ev.pull_request.base.sha, 'HEAD');
    } else if (isMain) {
      files = null; // 主干 fail-open：全量验证
    } else {
      const before = ev.before;
      const base = !before || before === '0'.repeat(40) ? 'HEAD~1' : before;
      files = gitList(base, 'HEAD');
    }
  } else {
    files = gitList('HEAD~1', 'HEAD');
  }

  const lanes = {};
  for (const l of LANE_ORDER) lanes[l] = files === null || files.some((f) => laneOf(f) === l);

  const outPath = process.env.GITHUB_OUTPUT;
  if (outPath && existsSync(outPath)) {
    appendFileSync(outPath, '\n' + LANE_ORDER.map((l) => `${l}=${lanes[l]}`).join('\n') + '\n');
  } else {
    console.log(JSON.stringify({ branch, isPr, lanes }, null, 2));
  }
}

main();