---
name: build-progressive-game-ui
description: Build and extend the progressive, diegetic game UI used by 远星, including narrative-first control reveals, plain-text-to-button activation, synchronized wrap transitions, text decoding, action fill progress, expandable status panels, reduced-motion handling, and timing validation. Use when modifying the opening flow, adding an unlockable control, tuning existing effects, or reusing these patterns in another game interface.
---

# Build Progressive Game UI

把界面当作叙事结果，而不是开局就存在的控制台。先让玩家理解一个概念，再让对应控件在原位获得可交互形态，最后才允许它移动、展开或承载更多信息。

## Core Rule

- 先叙事，后控件；先理解，后操作。
- 将“出现”“可点击”“展开”“迁移”建模为不同阶段，不要用一个布尔值同时表达多个含义。
- 新 UI 必须从已经发生的故事或动作中长出来，不要提前展示未来功能。
- 动画必须服务于空间连续性：玩家应能看懂一个元素去了哪里、为何变化。
- 不用可见说明文字解释界面或动画；让文案、位置和反馈本身完成教学。

## Workflow

1. 先读当前实现和长期决策：
   - `src/app/game/[id]/kaleido/KaleidoAvgView.jsx`
   - `src/app/globals.css`
   - `src/app/game/[id]/gameUi.js`
   - 涉及入口文字解码时再读 `src/components/EntryTransition.jsx`
   - `Readme_GPT`
2. 把新增功能画成显式阶段。沿用现有主阶段 `hidden -> inline -> flying -> docked`；把语义状态独立命名，例如 `staminaRevealed` 与 `staminaExpanded`。
3. 先写叙事因果。动作尚不可用时渲染普通文字；只有在布局和语义都准备好后，才在同一位置替换为按钮。两种形态保持相同字体、行高和盒模型，避免瞬间跳位。
4. 把动画完成作为状态边界。优先监听 `animationend`，忽略子元素冒泡事件，并提供与 CSS 时长匹配的超时兜底。
5. 同步布局迁移。需要一起移动的状态框、动作按钮和对话框必须在同一次 React 提交中进入过渡状态，使用同一条 CSS 时间线和同一持续时间。
6. 只在布局稳定后测量。若面板仍在展开，先等待展开完成；飞行动画期间保留来源高度作为占位，避免周围内容回流。
7. 为窄屏和 `prefers-reduced-motion` 提供相同的最终状态。减少动画不能改变可用功能、顺序或解锁结果。
8. 若形成新的长期交互原则，更新 `Readme_GPT`；一次性的微调不要堆进长期文档。

## Farstar Invariants

- 游戏界面不显示顶部导航栏或开发控制项。
- 首次搜索按钮先播放 `1000ms` 背景填充，再提交搜索结果；填充期间锁定重复点击。
- 首轮对话最后一行完成后等待 `180ms`，再开始整体重排，避免文本仍在入场时测量。
- 状况框和搜索按钮先向右滑出，再从左侧滑入；它们与对话框靠右停驻共用 `900ms` 时间线。
- 状况框初次出现时自动显示“状况”、生命百分比和生命条；不显示 ATK、DEF 或 `78/100` 形式的原始数值。
- 对话中的“状态”在迁移完成前必须是普通文字；停驻完成后原位变为文字按钮。
- 点击“状态”后，现有状况框向下生长，并在 `640ms` 内显现体力百分比和体力条；不要替换成另一个面板。
- 当前开局不显示背包按钮。
- 紧凑面板圆角不超过 `8px`，字距为 `0`，文字、按钮和动画占位在桌面与移动端都不能互相覆盖。

## Effect Selection

实现或组合动画前，读取 [references/effect-recipes.md](references/effect-recipes.md)。优先复用已有状态机、类名和时间常量；只有在新的叙事行为确实需要不同语义时才增加新阶段。

## Validation

依次执行：

```powershell
git diff --check
$env:NEXT_PUBLIC_APP_MODE='frontend'; npm.cmd run build
npm.cmd run smoke
```

逐项确认：

- 控件在语义就绪前无法点击，也没有按钮外观。
- 普通文字变成按钮时没有重排、闪跳或行高变化。
- 展开完成后才测量迁移起点。
- 所有协同元素同时开始、同时结束，并落在稳定位置。
- 快速连点不会重复提交动作或重启动画。
- 减少动态效果模式直接到达同一最终状态。
- 桌面与窄屏均无重叠、裁切和横向溢出。

项目包含 `.openai/hosting.json` 时，完成运行时界面改动后按 Sites 发布流程验证并部署。只修改本技能或文档时不创建无意义的站点版本。
