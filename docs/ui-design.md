# UI 设计规范（反 AI 味）

本文件对 Aether 仓库内**所有** UI 产出（`app/src/` 下的组件、页面、样式；TUI 不受排版部分约束但同样禁止花活）具有约束力。任何 AI agent 生成或修改界面代码前必须读本文件；把每个"禁止"当作硬规则，把每个"必须"当作验收项。

原则一句话：**默认值 = 没选择 = AI 味。每个视觉决定都必须是有意的。**

## 一、硬性禁止（P0，出现即返工）

1. **渐变紫/靛蓝→蓝**：`bg-gradient-to-br from-indigo-500 to-purple-600` 这类（以及 violet/purple 系强调色，如 `#6C63FF`、`#8B5CF6`）。渐变只允许**同一色相的深浅过渡**，且必须有主题依据。
2. **渐变文字标题**：`bg-clip-text text-transparent bg-gradient-to-r ...`。标题必须是纯色。
3. **无脑毛玻璃**：`backdrop-blur` / `backdrop-filter: blur()` 只允许用于真实层叠场景（导航压在滚动内容上）；普通卡片/面板/弹窗一律用**不透明**背景。新代码禁止新增半透明 surface（`rgba(...,0.7)` 类背景 + blur 的组合）。
4. **默认模板味**：不换字的 shadcn/zinc/slate 默认主题、默认 `--radius`、默认蓝按钮（`bg-blue-500`/`bg-blue-600`）、默认 `Inter`/`system-ui` 全站一个字体、Lucide 默认图标 + 圆角方块底（icon-in-chip）。
5. **大圆角 + 大阴影全家桶**：`rounded-2xl`/`rounded-3xl` + `shadow-lg`/`shadow-xl` 铺满所有卡片。圆角分级见下，阴影只表层级。
6. **彩色发光阴影**：`shadow-indigo-500/50` 这类。阴影用中性色。
7. **emoji 当图标**：导航、按钮、功能列表里用 emoji 顶替图标。emoji 只允许出现在用户生成的文本内容里。
8. **箭头字符粘在文案上**：按钮/链接文案里写 `→` `←`。需要方向提示用真实图标组件。
9. **营销式空话**：`Elevate your workflow`、`无缝`、`强大`、`best-in-class` 这类。写具体做什么。
10. **「✨ 新品」胶囊徽章**、左侧彩色条装饰卡片、均匀的 1-2-3 步骤图。

## 二、主题与颜色纪律

- 颜色一律走 `app/src/utils/theme.ts` 的 CSS 变量（`--bg-primary`、`--accent`、`--border`、`--text-*`、`--content-bg`…），**禁止**在组件里硬编码十六进制色值；新增主题色先加 token。
- 60/30/10：一个主导背景色、一个次级色、一个强调色（`--accent`）只用于需要强调的地方。
- 强调色必须与品牌/语义绑定（动作、选中、链接），**不许**"因为好看"选紫色。
- 深色主题正文对比度 ≥ AA（至少 `#A0A0C0` 级别），禁止灰底灰字。
- `--shadow-card` 之外的阴影必须解释用途。

## 三、圆角 / 阴影 / 边框

- 圆角分级：控件 6px、卡片/面板 10px、弹窗 12px。**超过 12px 必须写注释说明理由**。圆形（999px）只用于头像/开关。
- 阴影 = 层级：浮层 > 卡片 > 平面。平面元素不要阴影。
- 边框用 `--border`；禁止用"白 10% 描边"（`border-white/10`）区分深色卡片——用真实色阶。

## 四、组件状态（缺一不可）

每个可交互元素必须有：`:hover`、`:focus-visible`（键盘焦点可见）、`:active`、`:disabled` 样式和过渡。表单必须有 error/loading/empty 态。**没有状态的组件 = 返工。**

## 五、排版

- 标题/正文/辅助文字三级字号与字重必须成体系，禁止全站一个字号一个粗细。
- 展示性字体用在标题，正文用干净的无衬线；**不要**标题里夹一个斜体衬线单词当装饰（"The *modern* way"）。
- 眉题（大写字母间距小标签）克制使用，不要每节一个。
- 代码/数据用等宽字体（`--ds-font-family-code` 类 token）。

## 六、布局（这是桌面工作台，不是营销页）

- 密度优先、信息层级优先；**禁止**把工作台页面当 landing page 做（居中 hero、徽章+大标题+三个按钮的组合）。
- 禁止三张一模一样的图标功能卡、四列默认页脚、无差别 `container mx-auto` 套娃。宽度是工具不是常量。
- 同一列表/卡片组里，尺寸与密度可以也应该有差异（由内容重要性决定），但间距要有节奏，不要全部等距。

## 七、动效

- 默认无动效。需要时：一个统一 easing + 时长刻度；`prefers-reduced-motion: reduce` 时必须关闭。
- 禁止"所有区块同一个 fade-up 入场"、禁止到处微交互。

## 八、文案

- 按钮写动作（"保存更改"不是"提交"），动作名全流程一致（"发布"按钮 → "已发布" toast）。
- 错误信息说清楚发生了什么、怎么修；空状态是行动邀请。
- 具体 > 聪明 > 空洞。

## 九、AI 生成/修改 UI 的验收清单（提交前逐条过）

1. 没有渐变紫/渐变标题/毛玻璃/彩色发光阴影（grep 也查一遍）
2. 没有硬编码色值，全部走 theme token
3. 圆角 ≤ 12px（或注释了理由）
4. hover / focus-visible / active / disabled 全齐
5. loading / error / empty 三态全齐
6. 没有 emoji 图标、没有 `→` 字符、没有 lucide 圆角方块 chip
7. 深色模式对比度达标
8. 布局不是模板骨架（三卡同款/居中 hero 套件）
9. 动效克制且尊重 reduced-motion
10. 文案具体、无空洞形容词

## 十、存量代码

现有代码中违反本规范的模式（如 `theme.ts` 的 `glass` 主题紫强调色、`--glass-*`/`--content-*-trans` 半透明 token 及使用它们的组件）允许暂存，但**任何一次改动经过这些文件时必须顺手修正或标注 TODO**，不允许用本规范未覆盖为借口继续新增。

## 参考

- AI 味特征目录（本规范的直接依据）：`avoid-ai-design` skill 的 `references/ai-tells-catalog.md`
- Anthropic 前端美学指引: https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics
- 设计 slop 研究: https://adriankrebs.ch/blog/design-slop/
