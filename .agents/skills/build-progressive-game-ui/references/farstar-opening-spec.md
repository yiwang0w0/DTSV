# Farstar Opening Specification

这是远星开局递进式 UI 的自包含行为规范。它可以在没有远星源码的仓库中作为复现目标使用；下面列出的路径只是已知实现位置，不是 Skill 的运行前提。

## Narrative Sequence

1. 未登录用户在首页只看到登录与注册入口。
2. 已登录用户直接进入游戏，不经过顶部导航栏。
3. 开局叙事逐行出现；可用功能尚未被故事引出时，不显示对应 HUD 或按钮。
4. 玩家点击首次“搜索”后，按钮先播放 `1000ms` 背景填充，再提交搜索结果并记录一次状态。
5. 叙事依次建立供电恢复、状态读取与随身储物等概念；当前开局暂不显示背包按钮。
6. 状况框初次出现时自动显示“状况”、生命百分比和生命条。
7. 叙事句“你动起来了。试图确认一下自己的状态。”中的“状态”在对话与迁移期间保持普通文字。
8. 对话完全结束并停顿 `180ms` 后，状态框与搜索按钮向右滑出、从左滑入，同时对话框靠右停驻。三者共用 `900ms` 时间线。
9. 迁移完成后，“状态”在原位变成文字按钮。
10. 点击“状态”后，现有状况框在 `640ms` 内向下生长，浮现体力百分比与体力条。

## State Model

- 主空间阶段：`hidden -> inline -> flying -> docked`
- 内容出现：`staminaRevealed`
- 展开结束：`staminaExpanded`
- 交互就绪：对话框已停驻，并且状况框处于 `docked`
- 搜索提交锁：填充期间阻止重复点击

不要把 `staminaRevealed` 与 `staminaExpanded` 合并。迁移需要测量面板高度；若体力区域正在展开，必须等动画结束后再测量。

## Visual Contract

- 游戏界面不显示顶部导航栏、预览控制项或关闭按钮。
- 状况框不显示 ATK 与 DEF。
- 生命和体力只显示百分比，不显示 `78/100` 形式的原始数值。
- 搜索按钮在停驻后位于左侧状况框下方。
- 对话框左缘靠近左侧 UI 区域，不保留夸张空白；宽度可随未来 UI 增加再调整。
- 按钮、文字和面板在桌面与窄屏都不得重叠。
- 普通“状态”文字与按钮形态共享字体和行高，形态切换不得造成跳位。

## Motion Contract

```js
const SEARCH_COMMIT_DELAY = 1000;
const DIALOG_SETTLE_PAUSE = 180;
const STAMINA_EXPAND_MS = 640;
const LAYOUT_TRANSITION_MS = 900;
```

- 对话最后一行的动画结束事件启动停顿计时。
- 状况框、搜索按钮和对话框在同一次状态提交中启动迁移。
- 状况框与搜索按钮前段向右退出，中点切到左侧画外，后段从左进入目标位置。
- 飞行期间保留来源高度；结束后一次性切换到 `docked` 并移除飞行克隆。
- `prefers-reduced-motion` 直接到达相同最终状态，不跳过解锁或动作提交。

## Optional Known Implementation Map

在远星 Sites 工作树中，这套实现曾位于：

- `src/app/game/[id]/kaleido/KaleidoAvgView.jsx`
- `src/app/globals.css`
- `src/app/game/[id]/gameUi.js`
- `src/components/EntryTransition.jsx`
- `Readme_GPT`

如果目标仓库没有这些文件，继续使用本规范和通用配方，不要据此断言实现不存在。远星的公开 GitHub 分支、Sites 私有部署源和本地工作树可能处于不同版本；需要同步代码时应先确认用户希望以哪一份为准。
