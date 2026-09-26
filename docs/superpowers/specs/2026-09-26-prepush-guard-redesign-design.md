# PrePushGuard 重构设计

日期:2026-09-26
分支:`fix/prepush-guard-redesign`
基线:`ee329f2`

## 背景

`app/electron/tools/prePushGuard.js` 于 500b65c 引入,自称「多阶段推送审查与防御流水线」,含四个阶段。上线后连续 6 次修复提交,但实测仍有若干失效点,其中两个是静默失效(不报错、不拦截、看起来正常)。

实测结论(均在真临时仓库中验证):

| 场景 | 现状 |
| --- | --- |
| clone → feature 分支 → 推,带密钥 | ✅ 正确拦截 |
| 新仓库首次推送,带 `.env` + 密钥 | ❌ `ok: true`,0 findings,密钥照推 |
| `git -c x=y push` | ❌ 完全不识别 |
| Windows 上有 build 脚本的仓库 | ❌ 每次推送都被拦,错误信息为空 |

## 目标

**一件事:阻止 agent 把密钥/敏感文件推到远端**,并给权限弹窗一份诚实的推送预览。

## 非目标(本次删除)

- **Stage 1 分支保护** — 删除。分支策略是 GitHub branch protection 的职责。进程内实现的结果是:既不拦截,其产出的 `warnings` 也无任何调用方消费(registry 只读 `ok`/`reason`/`summary`),完全空转。
- **Stage 3 构建预检** — 删除。理由有三:(1) 推送前同步跑完整构建在原理上不成立,Aether 自身的 `build` 含 `electron-builder`;(2) `spawnSync('npm.cmd', ...)` 不带 `shell: true` 在 Node ≥18.20.2 上 EINVAL,实测对内容为 `echo built ok` 的脚本都判 `pre_flight_failed`;(3) 它会自动执行被推送仓库自己声明的脚本,即不可信代码。构建验证归 CI。
- **按路径豁免内容扫描** — 删除。原规则跳过 `test|tests|__tests__|fixtures` 目录及 `*.test.*`/`*.spec.*` 的全部内容扫描,实测把真密钥提交到 `app/test/fixtures/` 下 `ok: true`、0 findings。该豁免的成因是测试文件内嵌了字面量密钥串,正确做法是让测试模式在运行时拼出(见「测试」节)。

## 模块接口

`prePushGuard.js` 导出:

```js
isPushCommand(command)              // -> { isPush, segment? }
parsePushDetails(segment, gitRoot)  // -> { remote, branch, branches, isDryRun, isTags, isAll, isDelete }
resolveScanRange(gitRoot, details)  // -> { range, base, wholeTree }
scanForSecrets(gitRoot, details)    // -> { ok, rule?, findings, blocking, range, wholeTree, reason?, skipped? }
inspectPushCommand(command, ctx)    // -> { ok, isPush, reason?, summary?, dryRun?, deletion?, notGitRepo?, skipped? }
getPushSummary(gitRoot, details, scan)
isSensitiveFilename(filePath)       // 拦截层
looksSecretNamed(filePath)          // 仅提示层
SECRET_DIFF_PATTERNS / EMPTY_TREE / SKIP_ENV_VAR
```

`parsePushDetails` 收的是 **segment**(已切出的含 `git push` 的那一段),不是整条命令;含 `&&` 的命令由 `isPushCommand` 切段后传入。

移除的导出:`checkBranchProtection`、`isDocOnlyChangeset`、`PROTECTED_BRANCHES`、`DOC_ONLY_EXTENSIONS`。
(`sdk/index.js` 整体 re-export 该模块,全仓消费者只有 `registry.js` 与 `toolImpact.js`,收窄导出面安全。)

## 核心不变量

### 1. 扫描范围:既不静默为空,也不误报已公开内容

两个方向的错误不对称:范围为空 = 静默放行密钥(实际发生过的那个);范围过大 = 拦下无泄漏的推送。故规则是「扫这次推送**新引入**的全部内容;无法判定时,扫它**会送出**的全部内容」。

「新引入」以**远端已有的引用**为基准,而非空树:

```
base := <remote>/<branch> | @{u} | <remote>/master | <remote>/main | 其他远端跟踪引用
range := base..HEAD            // 增量
若一个远端跟踪引用都不存在:
range := <empty-tree>..HEAD    // 整树:全新仓库
```

两种看似相同的情形答案不同:

- **全新仓库**(无任何远端跟踪引用)→ 无任何内容已知公开,整树扫描;
- **既有 clone 中的新分支** → `origin/master..HEAD` 恰是本次推送新增的部分,已在远端的文件不重复扫。

原实现的头号缺陷:`getUnpushedRange` 的回退链含**本地** `master`/`main`,在「新仓库首次推送」时 `rev-parse --verify master` 命中本地分支,范围退化为 `master..HEAD` —— 而 HEAD 就是 master —— 空 diff,零 findings。同时 `diff-tree` 缺 `--root`,根提交输出 0 字节。

修正:基准点**只允许远端跟踪引用**;一个都没有时才退回空树 `4b825dc642cb6eb9a060e54bf8d69288fbee4904`。空树分支同时消掉「无父提交 → diff-tree 空输出」这一类问题,不再需要 `--root` 特例。

**基准为什么必须相对远端(实测,本次设计中最重要的修正):** 本仓库 `app/test/securityRegression.test.js` 与 `app/test/toolResultMiddleware.test.js` 内含字面量假密钥,且早已提交、早已公开。整树扫描会把它们全数列入 `blocking`,于是**推任何新分支都被拦**——门禁直接不可用。这正是原实现引入 `test|tests|__tests__|fixtures` 路径豁免的成因。路径豁免会掩盖真泄漏(所以本次删掉了),正确解法是修基准:已在远端的内容与该次推送是否泄漏无关,重复扫它保护不了任何东西。

### 1b. 首次推送的严格性边界(明确)

严格性体现在**无法判定时整树扫描**,而不是「永远整树」:

| 情形 | 基准 | 严格度 |
| --- | --- | --- |
| 全新仓库、无远端引用 | 空树 | 整树,最严 |
| 既有 clone 推新分支 | `origin/master` | 扫新分支相对远端新增的部分 |
| 常规推送 | `<remote>/<branch>` 或 `@{u}` | 只扫未推送提交 |
| git diff 失败 | — | fail-closed,拦下 |

### 2. 参数解析不手工维护选项表

`remote` 解析:取第一个非选项 token 中,能在 `git remote` 中查到、或形似 URL/路径者;否则 `origin`。这一条同时消除两个 bug:

- `-u`/`--set-upstream` 被当作带值选项,吃掉 `origin`,导致 `git push -u origin feat/x` 解析出 `remote="feat/x"`
- `--repo origin master` 解析出 `remote="master"`

带值选项仅保留真正带值的:`--repo`、`--receive-pack`、`--exec`、`-o`/`--push-option`。
布尔选项:`-u`、`--set-upstream`、`--all`、`--mirror`、`--tags`、`-f`、`--force`、`-n`、`--dry-run`、`-d`、`--delete`、`--atomic`、`--follow-tags`、`-q`、`--quiet`、`-v`、`--verbose`、`--prune`。

### 3. 敏感文件名分两层:拦截 vs 仅提示

`a685c52` 引入扩展名早退后,`credential`/`secret` 子串判定对源码文件失效。但**不能简单地恢复为拦截**,本仓库实际存在:

```
app/electron/llm/credentialPool.js
app/skills/security-audit/references/10-secrets-and-credentials.md
app/test/credentialPool.test.js
```

恢复子串拦截 = 日常改这几个文件时推送被拦。故分两层:

| 层 | 规则 | 行为 |
| --- | --- | --- |
| **拦截** | `.env` / `.env.*`、`*.pem/.key/.p12/.pfx/.keystore/.jks`、`id_rsa/ed25519/ecdsa/dsa`(仅私钥名)、`*.sqlite/.sqlite3/.db` | 阻止推送 |
| **仅提示** | 文件名含 `credential` / `secret` | 记为 `review`,放行,并在推送摘要里提示 |

`id_rsa.pub` 之类的公钥**不拦**:它不是凭据,拦它是假阳性。

即:高置信度的凭据容器名才拦,子串只作为信号。`.example`/`.template`/`.sample`/`.dist` 豁免保留(真实约定),两层都豁免。

原先 `client_secret.json -> true` 这类「靠扩展名不在早退名单里侥幸命中」的行为不再需要——子串路径已不承担拦截职责。

### 4. diff 解析用 NUL 分隔

`--name-status` 改为 `-z`。原实现按空白切分、只取最后一个 token,导致 `docs/credential notes.txt` 被切成 `notes.txt`,敏感词丢失。`-z` 输出为 `STATUS\0path\0`,无歧义。

### 5. 出错时 fail-closed,但要有逃生口

读不到 diff 就不放行(方向不松),但报错信息中明确给出 `AETHER_SKIP_PREPUSH_GUARD=1`。`--name-status` 的 `maxBuffer` 显式调大(原为默认 1MB)。

### 6. 调用方对齐 cwd —— 本次未做,列为后续

`toolImpact.js` 的推送预览用 `args?.cwd || process.cwd()`。`generateDiff` 本身**已经**接受 `args.cwd`(测试直接传 cwd 即可复现摘要),但真实调用链里 `toolLoop.js` 不往 `run_command` 的 args 里塞 cwd,运行时仍落到 `process.cwd()`。

修它需要改 `toolLoop.js`(当时正被并行会话修改)或引入双路径 API,两者都制造冲突或不一致,故推迟。**不影响门禁本身**:registry 的挂载点用的是 `cwd || getWorkspaceRoot(ctx?.sessionId)`(取 workspace root 时按仓库既有写法包了 try/catch,避免因取根失败而把命令也拦掉)。只影响预览摘要描述的仓库是否与实际执行目录一致。

## 接线改动

- `registry.js:428` — 挂载点不变;门禁块收窄为「不 ok 就抛」,并在放行时把摘要(含仅提示项)渲染成一行状态,补上原先无人消费的 `warnings` 缺口。
- `featureFlags.js` — 删除 `git.allowProtectedBranchPush`、`git.prePushBuildCheck`;保留 `git.prePushGuard`,描述改为仅密钥扫描。
- `toolImpact.js` — **未改**(其 `generateDiff` 本就接受 `args.cwd`;缺的是调用方 `toolLoop.js` 不传,见第 6 节)。

## 测试

22 → **45 条**,全量替换为**真临时仓库集成测试**(`mkdtempSync` + 真 `git init` / `git clone` + 真 bare 远端),全部 hermetic,不读开发者工作区。原测试有两处结构缺陷:一是只测纯函数(`SECRET_DIFF_PATTERNS` 对字面量),而唯一能拦人的 `scanSensitiveAssets`/`runPreFlightCheck` 零覆盖;二是 `inspectPushCommand` 未传 `cwd`,落到 `process.cwd()` 即开发者活仓库,断言实际在断言「本地恰好没有未推送的敏感文件」。

覆盖的回归场景(每条都在真仓库上断言拦/放):

1. 全新仓库首次推送,含 `.env` + `sk-ant-` → 拦,`wholeTree === true`
2. clone → feature 分支 → `ghp_`(36 位)→ 拦,`range === 'origin/master..HEAD'`
3. **已在远端的假密钥不再触发**(即门禁自身曾有的假阳性)→ 放行
4. 干净推送 → 放行
5. `app/test/fixtures/` 下的真密钥 → 拦(路径豁免已删)
6. `credential notes.txt`(带空格路径)→ 路径完整、不被截成 `notes.txt`,且仅 review
7. 删除敏感文件 → 放行(删除不发送内容)
8. `git -c x=y push` / `GIT_SSH_COMMAND=x git push` → 拦(两种绕过均已识别)
9. `-u`/`--set-upstream`/`--repo`/`-o` 及 refspec 目标端 → `remote` 与 `branch` 解析正确
10. dry-run / 非仓库目录 / 非推送命令 → 放行
11. feature flag 关闭 → skipped
12. 逃生口 `AETHER_SKIP_PREPUSH_GUARD=1` → skipped
13. **同一条命令在「带密钥」与「干净」两个仓库上分别判 `false` / `true`** → 证明判定由传入 cwd 驱动,而非进程工作目录
14. `toolImpact` 推送预览含目标分支与文件清单

测试文件内的模式串改为运行时拼接(`'sk-ant-' + 'api03-' + 'a1B2c3D4e5'.repeat(3) + 'a1B2c3'`),源码行本身不匹配正则,故无需任何路径豁免。已实测:新测试文件逐行过 `SECRET_DIFF_PATTERNS` 零命中。

## 已知限制(不修,记录在案)

- 字符串检测天然可绕过:写脚本再执行、`npm run deploy` 间接推送、`sh -c`、推到另一个 remote。本模块是**防呆护栏,不是沙箱**,不按沙箱宣传。(`git -c` 与 `GIT_SSH_COMMAND=x` 前缀这两种**已被识别并拦下**;上面列的是原理上无解的。)
- 基准相对远端的取舍:若某密钥在本次推送之前就已进入远端默认分支,推新分支时不会重复报它。这是有意的——它已经公开了,重复报只会拦下所有新分支推送,把门禁推向被关掉。首次进入远端的那一刻(全新仓库整树扫描、或 `origin/master..HEAD` 增量)仍然拦得住。
