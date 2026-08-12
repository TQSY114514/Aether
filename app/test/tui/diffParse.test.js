// ─────────────────────────────────────────────────────────────────────────────
// diffParse.test.js — W3-t23: /diff 解析助手单测
// parseDiffStat / splitDiffFiles / renderDiffLine / diffToViewLines;
// 含真实 git 仓库测试: 建临时 repo → commit → 修改 → git diff 输出非空。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseDiffStat, splitDiffFiles, renderDiffLine, diffToViewLines } from '../../tui/diffParse.js'

const tmpDirs = []
function makeTmp(prefix = 'diff-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

const STAT = ` src/main.ts | 12 ++++++------
 src/util.ts | 5 +++++
 assets/logo.bin | Bin 0 -> 2048 bytes
 3 files changed, 14 insertions(+), 7 deletions(-)
`

describe('parseDiffStat — git diff --stat 解析', () => {
  it('常规行: path / added / removed', () => {
    const files = parseDiffStat(STAT)
    expect(files[0]).toEqual({ path: 'src/main.ts', added: 6, removed: 6 })
    expect(files[1]).toEqual({ path: 'src/util.ts', added: 5, removed: 0 })
  })

  it('Bin 行: added/removed 为 null; 汇总行跳过', () => {
    const files = parseDiffStat(STAT)
    expect(files[2]).toEqual({ path: 'assets/logo.bin', added: null, removed: null })
    expect(files).toHaveLength(3)
  })

  it('重命名行: 取目标路径', () => {
    expect(parseDiffStat(' old.ts => new.ts | 4 ++--')[0].path).toBe('new.ts')
  })

  it('空输出 → 空数组', () => {
    expect(parseDiffStat('')).toEqual([])
    expect(parseDiffStat(null)).toEqual([])
  })
})

const DIFF = `diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
 line1
-old line
+new line
 line3
diff --git a/src/util.ts b/src/util.ts
index 111..222 100644
--- a/src/util.ts
+++ b/src/util.ts
@@ -1 +1 @@
-x
+y
`

describe('splitDiffFiles — 按 diff --git 头部切分', () => {
  it('切出多文件, 去头保留内容', () => {
    const files = splitDiffFiles(DIFF)
    expect(files.map((f) => f.path)).toEqual(['src/main.ts', 'src/util.ts'])
    expect(files[0].content).toContain('--- a/src/main.ts')
    expect(files[0].content).toContain('+new line')
    expect(files[0].content).not.toContain('diff --git')
  })

  it('空输出 → 空数组', () => {
    expect(splitDiffFiles('')).toEqual([])
    expect(splitDiffFiles('   ')).toEqual([])
  })
})

describe('renderDiffLine — 行分类着色', () => {
  it('+ 内容行 → add; - 内容行 → del; 空行/普通 → ctx', () => {
    expect(renderDiffLine('+new line').type).toBe('add')
    expect(renderDiffLine('-old line').type).toBe('del')
    expect(renderDiffLine('  context').type).toBe('ctx')
    expect(renderDiffLine('').type).toBe('ctx')
  })

  it('头部行 → meta', () => {
    expect(renderDiffLine('+++ b/src/main.ts').type).toBe('meta')
    expect(renderDiffLine('--- a/src/main.ts').type).toBe('meta')
    expect(renderDiffLine('@@ -1,3 +1,4 @@').type).toBe('meta')
    expect(renderDiffLine('diff --git a/x b/x').type).toBe('meta')
    expect(renderDiffLine('index abc..def 100644').type).toBe('meta')
    expect(renderDiffLine('new file mode 100644').type).toBe('meta')
    expect(renderDiffLine('Binary files a/x and b/x differ').type).toBe('meta')
  })

  it('diffToViewLines: 文本 → {type, line} 数组', () => {
    const v = diffToViewLines('+a\n-b\nc')
    expect(v).toEqual([
      { type: 'add', line: '+a' },
      { type: 'del', line: '-b' },
      { type: 'ctx', line: 'c' },
    ])
  })
})

// ── 真实 git 仓库集成测试（CI 有 git 可用; 无 git 则跳过）──────────────────
describe('真实 git 仓库集成 (git diff)', () => {
  const gitAvailable = (() => {
    try { execFileSync('git', ['--version'], { stdio: 'pipe' }); return true } catch { return false }
  })()

  const runGit = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

  it.skipIf(!gitAvailable)('修改文件后 git diff 输出可解析（parseDiffStat 非空）', () => {
    const repo = makeTmp('diff-git-')
    runGit(repo, ['init', '-q'])
    runGit(repo, ['config', 'user.email', 't@t'])
    runGit(repo, ['config', 'user.name', 't'])
    writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n', 'utf8')
    runGit(repo, ['add', '.'])
    runGit(repo, ['commit', '-qm', 'init'])
    // 修改文件 → 未提交变更
    writeFileSync(join(repo, 'a.txt'), 'one\nCHANGED\nthree\n', 'utf8')
    writeFileSync(join(repo, 'b.txt'), 'new file\n', 'utf8')

    const statOut = runGit(repo, ['diff', '--stat'])
    const diffOut = runGit(repo, ['diff'])
    expect(statOut).toBeTruthy()
    const files = parseDiffStat(statOut)
    expect(files.length).toBeGreaterThan(0)
    expect(files.map((f) => f.path)).toContain('a.txt')
    expect(files.find((f) => f.path === 'a.txt').added).toBeGreaterThan(0)

    const sections = splitDiffFiles(diffOut)
    expect(sections.map((s) => s.path)).toContain('a.txt')
    const aSection = sections.find((s) => s.path === 'a.txt')
    expect(aSection.content).toContain('+CHANGED')
    expect(aSection.content).toContain('-two')
  })

  it.skipIf(!gitAvailable)('干净仓库: diff --stat 为空 → parseDiffStat 空数组', () => {
    const repo = makeTmp('diff-clean-')
    runGit(repo, ['init', '-q'])
    runGit(repo, ['config', 'user.email', 't@t'])
    runGit(repo, ['config', 'user.name', 't'])
    writeFileSync(join(repo, 'a.txt'), 'x\n', 'utf8')
    runGit(repo, ['add', '.'])
    runGit(repo, ['commit', '-qm', 'init'])
    const statOut = runGit(repo, ['diff', '--stat']).trim()
    expect(statOut).toBe('')
    expect(parseDiffStat(statOut)).toEqual([])
  })
})
