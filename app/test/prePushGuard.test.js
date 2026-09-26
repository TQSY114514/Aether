// ─────────────────────────────────────────────────────────────────────────────
// prePushGuard.test.js — Pre-push secret-leak gate tests
//
// These run against real temporary git repositories. The previous suite tested
// pure functions in isolation (`SECRET_DIFF_PATTERNS` against literals) while
// leaving `scanSensitiveAssets` — the only stage that could actually block —
// with zero end-to-end coverage, which is how a scan that silently matched
// nothing shipped. Anything here that claims to block or allow a push is
// asserted against a repo on disk.
//
// Every test passes an explicit `cwd`. The previous suite omitted it, so
// `inspectPushCommand` fell back to `process.cwd()` and asserted against the
// developer's live checkout — the assertions only held when that checkout
// happened to have no unpushed secrets.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const req = createRequire(import.meta.url)
const guard = req('../electron/tools/prePushGuard')

// ─── fixtures ────────────────────────────────────────────────────────────────
//
// Every secret-shaped string is composed at runtime. As literals they would
// trip the guard on the very commit that adds this file — which is exactly why
// the previous implementation carried a "skip everything under test/" hole. In
// production this file is still scannable; only the assembled value is secret.

const FAKE = {
  anthropic: () => 'sk-ant-' + 'api03-' + 'a1B2c3D4e5'.repeat(3) + 'a1B2c3',
  openai: () => 'sk-' + 'proj-' + 'a1B2c3D4e5'.repeat(3) + 'a1B2c3',
  github: () => 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'a1B2c3',
  aws: () => 'AKIA' + 'ABCDEFGHIJKLMNOP',
  privateKey: () => '-----BEGIN ' + 'RSA PRIVATE KEY-----',
}

const tmpRoots = []

function track(dir) {
  tmpRoots.push(dir)
  return dir
}

function git(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf-8', windowsHide: true })
}

function write(dir, rel, content) {
  const full = path.join(dir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

function commit(dir, message) {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
}

/** A brand-new repository with one commit and no upstream. */
function freshRepo(label, files) {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), `ppg-${label}-`)))
  git(dir, 'init', '-q', '-b', 'master')
  git(dir, 'config', 'user.email', 'test@example.invalid')
  git(dir, 'config', 'user.name', 'PrePushGuard Test')
  git(dir, 'config', 'commit.gpgsign', 'false')
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content)
  commit(dir, 'initial commit')
  return dir
}

/** A bare remote plus a clone of it that already tracks master. */
function upstreamAndClone(label, seedFiles = { 'README.md': 'seed\n' }) {
  const root = track(fs.mkdtempSync(path.join(os.tmpdir(), `ppg-up-${label}-`)))
  const bare = path.join(root, 'upstream.git')
  spawnSync('git', ['init', '-q', '--bare', bare], { windowsHide: true })

  const seed = track(fs.mkdtempSync(path.join(os.tmpdir(), `ppg-seed-${label}-`)))
  spawnSync('git', ['clone', '-q', bare, seed], { windowsHide: true })
  git(seed, 'config', 'user.email', 'test@example.invalid')
  git(seed, 'config', 'user.name', 'PrePushGuard Test')
  git(seed, 'config', 'commit.gpgsign', 'false')
  for (const [rel, content] of Object.entries(seedFiles)) write(seed, rel, content)
  commit(seed, 'seed')
  git(seed, 'push', '-q', 'origin', 'master')

  const clone = track(fs.mkdtempSync(path.join(os.tmpdir(), `ppg-clone-${label}-`)))
  spawnSync('git', ['clone', '-q', bare, clone], { windowsHide: true })
  git(clone, 'config', 'user.email', 'test@example.invalid')
  git(clone, 'config', 'user.name', 'PrePushGuard Test')
  git(clone, 'config', 'commit.gpgsign', 'false')
  return { bare, clone }
}

afterAll(() => {
  for (const dir of tmpRoots) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

describe('prePushGuard', () => {
  // ─── isPushCommand ─────────────────────────────────────────────────────────
  describe('isPushCommand', () => {
    it('detects a plain push', () => {
      expect(guard.isPushCommand('git push origin master').isPush).toBe(true)
    })

    it('detects a push after a shell separator', () => {
      expect(guard.isPushCommand('npm test && git push origin master').isPush).toBe(true)
    })

    it('detects a push through -C', () => {
      expect(guard.isPushCommand('git -C /some/path push').isPush).toBe(true)
    })

    it('detects a push carrying a git config override', () => {
      // Regression: `git -c x=y push` used to parse the config value as the
      // subcommand and slip past the gate entirely.
      expect(guard.isPushCommand('git -c core.hooksPath=/dev/null push origin master').isPush).toBe(true)
    })

    it('detects a push behind an environment assignment', () => {
      expect(guard.isPushCommand('GIT_SSH_COMMAND=ssh git push origin master').isPush).toBe(true)
    })

    it('ignores commands that are not pushes', () => {
      for (const cmd of ['npm test', 'git status', 'git commit -m x', 'git push --help', '']) {
        expect(guard.isPushCommand(cmd).isPush, cmd).toBe(false)
      }
    })
  })

  // ─── parsePushDetails ──────────────────────────────────────────────────────
  describe('parsePushDetails', () => {
    const repo = freshRepo('parse', { 'a.txt': 'a\n' })
    // parsePushDetails resolves the remote against `git remote`, so the fixture
    // needs a real one for the positional argument to be recognisable.
    git(repo, 'remote', 'add', 'origin', 'https://example.invalid/repo.git')

    const parse = (cmd) => guard.parsePushDetails(cmd, repo)

    it('parses remote and branch from the plain form', () => {
      const d = parse('git push origin master')
      expect(d.remote).toBe('origin')
      expect(d.branch).toBe('master')
    })

    it('does not let -u swallow the remote', () => {
      // Regression: `-u` was listed as value-taking, so the remote parsed as
      // the branch name. `git push -u origin <new branch>` is the standard
      // way to publish a branch.
      for (const cmd of [
        'git push -u origin feat/x',
        'git push --set-upstream origin feat/x',
      ]) {
        const d = parse(cmd)
        expect(d.remote, cmd).toBe('origin')
        expect(d.branch, cmd).toBe('feat/x')
      }
    })

    it('reads the remote from --repo', () => {
      const d = parse('git push --repo origin master')
      expect(d.remote).toBe('origin')
      expect(d.branch).toBe('master')
    })

    it('takes the destination side of a refspec', () => {
      expect(parse('git push origin HEAD:refs/heads/main').branch).toBe('main')
    })

    it('reports the source side of a refspec', () => {
      // The source is what travels, so it — not HEAD — is what a push of some
      // other branch has to be scanned against.
      const d = parse('git push origin feat/x:refs/heads/other')
      expect(d.branches).toEqual(['other'])
      expect(d.sources).toEqual(['feat/x'])
      expect(parse('git push origin feat/x').sources).toEqual(['feat/x'])
    })

    it('treats an all-deletion refspec as a deletion', () => {
      // `git push origin :feat/x` removes a ref and sends no content.
      expect(parse('git push origin :feat/x').isDelete).toBe(true)
    })

    it('does not let a push option swallow the remote', () => {
      const d = parse('git push -o ci.skip origin feat/x')
      expect(d.remote).toBe('origin')
      expect(d.branch).toBe('feat/x')
    })

    it('flags dry runs, tags, --all and deletions', () => {
      expect(parse('git push --dry-run origin master').isDryRun).toBe(true)
      expect(parse('git push --tags origin').isTags).toBe(true)
      expect(parse('git push --all origin').isAll).toBe(true)
      expect(parse('git push -d origin feat/x').isDelete).toBe(true)
    })

    it('falls back to the current branch when no refspec is given', () => {
      expect(parse('git push origin').branch).toBe('master')
    })
  })

  // ─── resolveScanRange ──────────────────────────────────────────────────────
  describe('resolveScanRange', () => {
    it('scans the whole tree when no remote-tracking branch exists', () => {
      // The headline regression. The old fallback chain included the LOCAL
      // branch name, so the first push of a fresh repo resolved to
      // `master..HEAD` — an empty range — and a push carrying .env passed.
      const repo = freshRepo('range', { 'a.txt': 'a\n' })
      const details = guard.parsePushDetails('git push -u origin master', repo)
      const resolved = guard.resolveScanRange(repo, details)

      expect(resolved.wholeTree).toBe(true)
      expect(resolved.base).toBe(guard.EMPTY_TREE)
      expect(resolved.range).not.toMatch(/^master\.\.HEAD$/)
    })

    it('scans incrementally once a remote-tracking branch exists', () => {
      const { clone } = upstreamAndClone('range')
      write(clone, 'new.txt', 'new\n')
      commit(clone, 'work')

      const details = guard.parsePushDetails('git push origin master', clone)
      const resolved = guard.resolveScanRange(clone, details)
      expect(resolved.wholeTree).toBe(false)
      expect(resolved.base).toBe('origin/master')
      expect(resolved.range).toBe('origin/master..HEAD')
    })

    it('bases a new branch on the refs the remote already has', () => {
      // Pushing `feat/new` must not re-scan files that are already public on
      // `origin/master`. Getting this wrong makes every new branch push
      // "leak" whatever the repository already contains.
      const { clone } = upstreamAndClone('newbranch')
      git(clone, 'checkout', '-q', '-b', 'feat/new')
      write(clone, 'new.txt', 'new\n')
      commit(clone, 'work')

      const resolved = guard.resolveScanRange(clone, guard.parsePushDetails('git push -u origin feat/new', clone))
      expect(resolved.wholeTree).toBe(false)
      expect(resolved.base).toBe('origin/master')
    })
  })

  // ─── resolveScanTargets ────────────────────────────────────────────────────
  describe('resolveScanTargets', () => {
    it('reports the pushed ref, not HEAD, when another branch is named', () => {
      // `git push origin feat/other` sends feat/other. Answering with HEAD's
      // range describes commits that are not being pushed.
      const { clone } = upstreamAndClone('targets-other')
      git(clone, 'checkout', '-q', '-b', 'feat/other')
      write(clone, 'x.js', 'x\n')
      commit(clone, 'work')
      git(clone, 'checkout', '-q', 'master')

      const targets = guard.resolveScanTargets(clone, guard.parsePushDetails('git push origin feat/other', clone))
      expect(targets).toHaveLength(1)
      expect(targets[0].tip).toBe('feat/other')
      expect(targets[0].range).toBe('origin/master..feat/other')
    })

    it('covers every local branch for --all, and tags for --tags', () => {
      const { clone } = upstreamAndClone('targets-all')
      git(clone, 'checkout', '-q', '-b', 'feat/two')
      write(clone, 'x.js', 'x\n')
      commit(clone, 'work')
      git(clone, 'checkout', '-q', 'master')
      git(clone, 'tag', 'v9')

      const all = guard.resolveScanTargets(clone, guard.parsePushDetails('git push --all origin', clone))
      expect(all.map(t => t.ref).sort()).toEqual(['feat/two', 'master'])

      const tagged = guard.resolveScanTargets(clone, guard.parsePushDetails('git push --tags origin', clone))
      expect(tagged.map(t => t.ref)).toContain('v9')
    })

    it('keeps a single target for an ordinary push', () => {
      const { clone } = upstreamAndClone('targets-one')
      const targets = guard.resolveScanTargets(clone, guard.parsePushDetails('git push origin master', clone))
      expect(targets).toHaveLength(1)
      expect(targets[0].range).toBe('origin/master..HEAD')
    })
  })

  // ─── filename heuristics ───────────────────────────────────────────────────
  describe('filename heuristics', () => {
    it('blocks by name for credential containers', () => {
      for (const f of [
        '.env', '.env.local', 'server.pem', 'deploy.key', 'key.p12', 'ident.pfx',
        'app.keystore', 'app.jks', 'id_rsa', 'id_ed25519', 'cache.sqlite', 'app.db',
      ]) {
        expect(guard.isSensitiveFilename(f), f).toBe(true)
      }
    })

    it('does not block a public key', () => {
      // `id_rsa.pub` is what the private key signs *with*; it is safe to share
      // and blocking it would be a false positive.
      expect(guard.isSensitiveFilename('id_rsa.pub')).toBe(false)
      expect(guard.looksSecretNamed('id_rsa.pub')).toBe(false)
    })

    it('exempts documented placeholder names', () => {
      for (const f of ['.env.example', 'deploy.pem.template', 'id_rsa.sample']) {
        expect(guard.isSensitiveFilename(f), f).toBe(false)
        expect(guard.looksSecretNamed(f), f).toBe(false)
      }
    })

    it('reports — but does not block — files that merely mention secrets', () => {
      // Deliberate: this repo legitimately contains
      // electron/llm/credentialPool.js and a security-audit doc about secrets.
      // Blocking on the substring would block ordinary work on them, so the
      // signal is surfaced without being fatal.
      for (const f of ['credentials.js', 'aws_secret.ts', 'secrets.py', 'credentialPool.js']) {
        expect(guard.isSensitiveFilename(f), f).toBe(false)
        expect(guard.looksSecretNamed(f), f).toBe(true)
      }
    })

    it('ignores ordinary files', () => {
      for (const f of ['index.js', 'notes.txt', 'README.md', 'package.json']) {
        expect(guard.isSensitiveFilename(f), f).toBe(false)
        expect(guard.looksSecretNamed(f), f).toBe(false)
      }
    })
  })

  // ─── SECRET_DIFF_PATTERNS ──────────────────────────────────────────────────
  describe('SECRET_DIFF_PATTERNS', () => {
    const matches = (text) => guard.SECRET_DIFF_PATTERNS.filter(p => p.re.test(text)).map(p => p.name)

    it('matches each supported credential shape', () => {
      expect(matches(`const k = "${FAKE.anthropic()}"`)).toContain('Anthropic API Key')
      expect(matches(`const k = "${FAKE.openai()}"`)).toContain('OpenAI API Key')
      expect(matches(`token=${FAKE.github()}`)).toContain('GitHub Token')
      expect(matches(`aws_key = "${FAKE.aws()}"`)).toContain('AWS Access Key ID')
      expect(matches(FAKE.privateKey())).toContain('Private Key Block')
    })

    it('attributes an Anthropic key to Anthropic', () => {
      // The OpenAI pattern used to match `sk-ant-` first, so the Anthropic
      // entry was unreachable and its keys were reported as OpenAI's.
      expect(matches(`k = "${FAKE.anthropic()}"`)).toEqual(['Anthropic API Key'])
    })

    it('leaves ordinary code alone', () => {
      for (const text of [
        'const task = "sk-短"',
        'const id = "AKIA"',
        'function fetchSecret() {}',
        'git push origin master',
      ]) {
        expect(matches(text), text).toEqual([])
      }
    })
  })

  // ─── scanForSecrets against real repositories ──────────────────────────────
  describe('scanForSecrets', () => {
    const SECRET_ENV = 'ANTHROPIC_API_KEY=' + FAKE.anthropic() + '\n'

    it('blocks the first push of a repository that carries a key', () => {
      // The regression that motivated this rewrite: a repo with no upstream
      // resolved to an empty scan range, so `.env` shipped on the very first
      // push — the moment a new project is most likely to leak.
      const repo = freshRepo('first', { '.env': SECRET_ENV, 'index.js': 'ok\n' })
      const details = guard.parsePushDetails('git push -u origin master', repo)
      const scan = guard.scanForSecrets(repo, details)

      expect(scan.ok).toBe(false)
      expect(scan.rule).toBe('secret_leak')
      expect(scan.wholeTree).toBe(true)
      expect(scan.blocking.map(f => f.file)).toContain('.env')
      expect(scan.blocking.map(f => f.type))
        .toEqual(expect.arrayContaining(['sensitive_filename', 'secret_pattern']))
    })

    it('blocks a token committed on a feature branch', () => {
      const { clone } = upstreamAndClone('feat')
      git(clone, 'checkout', '-q', '-b', 'feat/x')
      write(clone, 'config.js', 'const T = "' + FAKE.github() + '"\n')
      commit(clone, 'oops')

      const scan = guard.scanForSecrets(clone, guard.parsePushDetails('git push -u origin feat/x', clone))
      expect(scan.ok).toBe(false)
      // `origin/feat/x` does not exist, but `origin/master` does, so the base
      // is what the remote already holds rather than the whole tree.
      expect(scan.wholeTree).toBe(false)
      expect(scan.range).toBe('origin/master..HEAD')
      expect(scan.findings.some(f => f.detail.includes('GitHub Token'))).toBe(true)
    })

    it('does not re-flag a key that is already on the remote', () => {
      // The false positive that a whole-tree base produces, and the reason the
      // base is remote-relative: this repository ships test fixtures holding
      // literal fake keys. They are already public, so re-flagging them
      // protects nothing — but it blocks the push of every new branch, which
      // is how a gate ends up disabled by whoever it obstructed.
      const { clone } = upstreamAndClone('preexisting', {
        'README.md': 'seed\n',
        'test/fixtures/keys.js': 'module.exports = "' + FAKE.aws() + '"\n',
      })
      git(clone, 'checkout', '-q', '-b', 'feat/clean')
      write(clone, 'feature.js', 'export const x = 1\n')
      commit(clone, 'clean work')

      const scan = guard.scanForSecrets(clone, guard.parsePushDetails('git push -u origin feat/clean', clone))
      expect(scan.ok).toBe(true)
      expect(scan.blocking).toEqual([])
      expect(scan.findings).toEqual([])
    })

    it('allows a clean push', () => {
      const { clone } = upstreamAndClone('clean')
      git(clone, 'checkout', '-q', '-b', 'feat/clean')
      write(clone, 'feature.js', 'export const x = 1\n')
      commit(clone, 'clean work')

      const scan = guard.scanForSecrets(clone, guard.parsePushDetails('git push -u origin feat/clean', clone))
      expect(scan.ok).toBe(true)
      expect(scan.blocking).toEqual([])
    })

    it('has no exempt path for test fixtures', () => {
      // The old implementation skipped everything under a test/fixture path so
      // its own fake keys would not trip it — which also meant a real key
      // committed to a fixture directory leaked silently.
      const repo = freshRepo('fixture', {
        'app/test/fixtures/sample.js': 'module.exports = "' + FAKE.openai() + '"\n',
      })
      const scan = guard.scanForSecrets(repo, guard.parsePushDetails('git push -u origin master', repo))

      expect(scan.ok).toBe(false)
      expect(scan.blocking[0].file).toBe('app/test/fixtures/sample.js')
    })

    it('keeps paths containing spaces intact', () => {
      // `git diff --name-status` quotes such a path; with `-z` it does not, so
      // the name cannot be truncated into a different one.
      const repo = freshRepo('spaces', { 'docs/credential notes.txt': 'plain text\n' })
      const scan = guard.scanForSecrets(repo, guard.parsePushDetails('git push -u origin master', repo))

      expect(scan.ok).toBe(true)
      expect(scan.findings.map(f => f.file)).toContain('docs/credential notes.txt')
      expect(scan.findings.find(f => f.file === 'docs/credential notes.txt').severity).toBe('review')
    })

    it('blocks a push of another branch made while HEAD is clean', () => {
      // `git push origin feat/dirty` sends feat/dirty, not HEAD. Judged against
      // HEAD's increment it scanned an unrelated (here empty) range, and the key
      // went through.
      const { clone } = upstreamAndClone('otherbranch')
      git(clone, 'checkout', '-q', '-b', 'feat/dirty')
      write(clone, 'k.js', 'const k = "' + FAKE.anthropic() + '"\n')
      commit(clone, 'secret on feat/dirty')
      git(clone, 'checkout', '-q', 'master')

      const scan = guard.scanForSecrets(clone, guard.parsePushDetails('git push origin feat/dirty', clone))
      expect(scan.ok).toBe(false)
      expect(scan.blocking.map(f => f.file)).toContain('k.js')
      expect(scan.ranges).toContain('origin/master..feat/dirty')
    })

    it('covers every branch when --all is pushed', () => {
      // Scanning the current branch only let a different branch carrying a key
      // ride along unexamined.
      const { clone } = upstreamAndClone('allrefs')
      git(clone, 'checkout', '-q', '-b', 'feat/dirty')
      write(clone, 'k.js', 'const k = "' + FAKE.github() + '"\n')
      commit(clone, 'secret on feat/dirty')
      git(clone, 'checkout', '-q', 'master')

      const scan = guard.scanForSecrets(clone, guard.parsePushDetails('git push --all origin', clone))
      expect(scan.ok).toBe(false)
      expect(scan.ranges.some(r => r.endsWith('..feat/dirty'))).toBe(true)
    })

    it('covers tags, which carry commits no branch range reaches', () => {
      const { clone } = upstreamAndClone('tags')
      git(clone, 'checkout', '-q', '-b', 'feat/dirty')
      write(clone, 'k.js', 'const k = "' + FAKE.aws() + '"\n')
      commit(clone, 'secret on feat/dirty')
      git(clone, 'checkout', '-q', 'master')
      git(clone, 'tag', 'v1', 'feat/dirty')

      const scan = guard.scanForSecrets(clone, guard.parsePushDetails('git push --tags origin', clone))
      expect(scan.ok).toBe(false)
      expect(scan.ranges).toContain('origin/master..v1')
    })

    it('reports a non-ASCII path as the path, not as an escape sequence', () => {
      // git escapes such a path inside the `+++` header unless quotePath is off,
      // which used to report the finding against `docs/\346\215\256...`.
      const repo = freshRepo('unicode', { 'docs/凭据 credential 说明.md': 'k = "' + FAKE.anthropic() + '"\n' })
      const scan = guard.scanForSecrets(repo, guard.parsePushDetails('git push -u origin master', repo))

      expect(scan.ok).toBe(false)
      expect(scan.findings.find(f => f.type === 'secret_pattern').file).toBe('docs/凭据 credential 说明.md')
    })

    it('does not block when a sensitive file is only being removed', () => {
      const { clone } = upstreamAndClone('remove', {
        'README.md': 'seed\n',
        'legacy.pem': 'not a real key\n',
      })
      fs.unlinkSync(path.join(clone, 'legacy.pem'))
      commit(clone, 'remove legacy pem')

      const scan = guard.scanForSecrets(clone, guard.parsePushDetails('git push origin master', clone))
      expect(scan.ok).toBe(true)
      expect(scan.findings).toEqual([])
    })

    it('honours the escape hatch', () => {
      const repo = freshRepo('skip', { '.env': SECRET_ENV })
      const details = guard.parsePushDetails('git push -u origin master', repo)
      const previous = process.env[guard.SKIP_ENV_VAR]
      try {
        process.env[guard.SKIP_ENV_VAR] = '1'
        expect(guard.scanForSecrets(repo, details)).toMatchObject({ ok: true, skipped: true })
      } finally {
        if (previous === undefined) delete process.env[guard.SKIP_ENV_VAR]
        else process.env[guard.SKIP_ENV_VAR] = previous
      }
    })
  })

  // ─── inspectPushCommand ────────────────────────────────────────────────────
  describe('inspectPushCommand', () => {
    const SECRET_ENV = 'ANTHROPIC_API_KEY=' + FAKE.anthropic() + '\n'

    /** A throwaway directory that is not inside any repository. */
    function outsideRepo(label) {
      return track(fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-outside-' + label + '-')))
    }

    it('passes a non-push command through', async () => {
      const res = await guard.inspectPushCommand('npm test', { cwd: outsideRepo('nonpush') })
      expect(res.ok).toBe(true)
      expect(res.isPush).toBe(false)
    })

    it('ignores a dry run', async () => {
      const repo = freshRepo('dry', { '.env': SECRET_ENV })
      const res = await guard.inspectPushCommand('git push --dry-run -u origin master', { cwd: repo })
      expect(res.ok).toBe(true)
      expect(res.dryRun).toBe(true)
    })

    it('passes through outside a repository', async () => {
      const res = await guard.inspectPushCommand('git push origin master', { cwd: outsideRepo('nogit') })
      expect(res.ok).toBe(true)
      expect(res.notGitRepo).toBe(true)
    })

    it('blocks a push carrying a key', async () => {
      const repo = freshRepo('block', { '.env': SECRET_ENV })
      const res = await guard.inspectPushCommand('git push -u origin master', { cwd: repo })
      expect(res.ok).toBe(false)
      expect(res.reason).toContain('.env')
    })

    it('blocks a push that dodges through a git config override', async () => {
      const repo = freshRepo('dashc', { '.env': SECRET_ENV })
      const res = await guard.inspectPushCommand('git -c core.hooksPath=/dev/null push -u origin master', { cwd: repo })
      expect(res.ok).toBe(false)
    })

    it('blocks a push behind an environment assignment', async () => {
      const repo = freshRepo('envprefix', { '.env': SECRET_ENV })
      const res = await guard.inspectPushCommand('GIT_SSH_COMMAND=ssh git push -u origin master', { cwd: repo })
      expect(res.ok).toBe(false)
    })

    it('reports the target and the commit count for a clean push', async () => {
      const { clone } = upstreamAndClone('summary')
      git(clone, 'checkout', '-q', '-b', 'feat/z')
      write(clone, 'a.js', '1\n')
      commit(clone, 'work')

      // First push of a branch: the remote has no `feat/z`, so the base is its
      // default branch and the summary covers the commits this push adds.
      const first = await guard.inspectPushCommand('git push -u origin feat/z', { cwd: clone })
      expect(first.ok).toBe(true)
      expect(first.summary.remote).toBe('origin')
      expect(first.summary.branch).toBe('feat/z')
      expect(first.summary.wholeTree).toBe(false)
      expect(first.summary.commitsCount).toBe(1)
      expect(first.summary.files).toEqual(['a.js'])

      // Once the branch exists remotely the range narrows to what is genuinely
      // unpushed, which is what the summary must report on every later push.
      git(clone, 'push', '-q', '-u', 'origin', 'feat/z')
      write(clone, 'b.js', '2\n')
      commit(clone, 'more work')

      const second = await guard.inspectPushCommand('git push origin feat/z', { cwd: clone })
      expect(second.ok).toBe(true)
      expect(second.summary.wholeTree).toBe(false)
      expect(second.summary.commitsCount).toBe(1)
      expect(second.summary.commits[0]).toContain('more work')
      expect(second.summary.files).toEqual(['b.js'])
    })

    it('notes a suggestive filename without blocking on it', async () => {
      const repo = freshRepo('note', { 'electron/llm/credentialPool.js': 'module.exports = {}\n' })
      const res = await guard.inspectPushCommand('git push -u origin master', { cwd: repo })

      expect(res.ok).toBe(true)
      expect(res.summary.notes.join(' ')).toContain('credentialPool.js')
    })

    it('stays inert when the feature flag is off', async () => {
      const repo = freshRepo('flag', { '.env': SECRET_ENV })
      const res = await guard.inspectPushCommand('git push -u origin master', {
        cwd: repo,
        db: { getSetting: () => '0' },
      })
      expect(res.ok).toBe(true)
      expect(res.skipped).toBe(true)
    })

    it('judges the repository it is pointed at, not the process working directory', async () => {
      // The old suite omitted `cwd` and so asserted against the developer's own
      // checkout, passing or failing depending on whether it happened to hold
      // unpushed secrets. Both halves of this assertion cannot hold unless the
      // decision really is driven by `cwd`.
      const dirty = freshRepo('cwd-dirty', { '.env': SECRET_ENV })
      const clean = freshRepo('cwd-clean', { 'index.js': 'ok\n' })

      expect((await guard.inspectPushCommand('git push -u origin master', { cwd: dirty })).ok).toBe(false)
      expect((await guard.inspectPushCommand('git push -u origin master', { cwd: clean })).ok).toBe(true)
    })
  })

  // ─── toolImpact integration ────────────────────────────────────────────────
  describe('toolImpact', () => {
    const impact = req('../electron/tools/toolImpact')

    it('flags a push as high risk', () => {
      const t = impact.toolImpact('run_command', { command: 'git push origin feat/x' })
      expect(t.riskTags).toContain('git_push')
      expect(t.severity).toBe('high')
    })

    it('renders a push summary for the approval dialog', () => {
      const { clone } = upstreamAndClone('impact')
      git(clone, 'checkout', '-q', '-b', 'feat/summary')
      write(clone, 'a.js', '1\n')
      commit(clone, 'work')

      const d = impact.generateDiff('run_command', {
        command: 'git push -u origin feat/summary',
        cwd: clone,
      })

      expect(d.newPath).toBe('origin/feat/summary')
      expect(d.diff).toContain('PrePushGuard')
      expect(d.diff).toContain('origin/feat/summary')
      expect(d.diff).toContain('a.js')
    })

    it('produces no push summary for an ordinary command', () => {
      expect(impact.generateDiff('run_command', { command: 'npm test', cwd: os.tmpdir() })).toBeNull()
    })
  })
})
