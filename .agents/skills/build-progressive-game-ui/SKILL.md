---
name: build-progressive-game-ui
description: Design and implement narrative-first progressive game UIs in any web game, including controls that emerge from story text, synchronized layout transitions, decoded text, action-fill feedback, expandable status panels, reduced-motion handling, and timing validation. Use when creating or extending an opening flow, adding an unlockable control, tuning these effects, reproducing the Farstar opening, or adapting the interaction language to a different repository.
---

# Build Progressive Game UI

把界面当作叙事结果，而不是开局就存在的控制台。先让玩家理解一个概念，再让对应控件在原位获得可交互形态，最后才允许它移动、展开或承载更多信息。

## Select The Context

先检查当前工作区，再决定采用哪种模式。不要假设调用 Skill 的仓库就是远星，也不要把缺少某个项目文件误判为实现不存在。

1. 使用 `rg --files`、项目清单和现有组件定位真实入口、样式与状态管理方式。
2. 当前仓库没有远星文件时，使用**通用模式**：读取 [references/effect-recipes.md](references/effect-recipes.md)，把模式映射到现有框架和命名。
3. 用户明确提到远星、要求复现远星开局，或仓库中存在相符实现时，使用**远星模式**：额外读取 [references/farstar-opening-spec.md](references/farstar-opening-spec.md)。该文档是自包含行为规范，不要求目标仓库存在任何固定路径。
4. 没有代码仓库时，先输出或实现独立原型；不要为了验证示例路径而中断任务。
5. 只描述当前可访问工作区的事实。若某实现可能位于另一分支、私有部署源或本地工作树，明确限定结论，不猜测其作者或来源。

## Core Rules

- 先叙事，后控件；先理解，后操作。
- 将“出现”“可点击”“展开”“迁移”建模为不同阶段，不要用一个布尔值同时表达多个含义。
- 新 UI 必须从已经发生的故事或动作中长出来，不要提前展示未来功能。
- 动画必须服务于空间连续性：玩家应能看懂一个元素去了哪里、为何变化。
- 不用可见说明文字解释界面或动画；让文案、位置和反馈本身完成教学。
- 保留目标项目的组件、状态和样式习惯；不要为了套用配方重写无关架构。

## Workflow

1. 找到当前叙事流、动作处理、HUD、全局动画和响应式规则。文件名由目标仓库决定。
2. 把新增功能画成显式阶段。例如 `hidden -> inline -> flying -> docked`；把语义状态独立命名，例如 `detailsRevealed` 与 `detailsExpanded`。
3. 先写叙事因果。动作尚不可用时渲染普通文字；只有布局和语义都准备好后，才在同一位置替换为按钮。两种形态保持相同字体、行高和盒模型。
4. 把动画完成作为状态边界。优先监听 `animationend` 或 `transitionend`，忽略子元素冒泡事件，并提供与 CSS 时长匹配的超时兜底。
5. 同步布局迁移。需要一起移动的元素必须在同一次状态提交中进入过渡阶段，使用同一条时间线和持续时间。
6. 只在布局稳定后测量。若面板仍在展开，先等待展开完成；飞行动画期间保留来源高度作为占位，避免周围内容回流。
7. 为窄屏和 `prefers-reduced-motion` 提供相同的最终状态。减少动画不能改变功能、顺序或解锁结果。
8. 按目标项目的文档习惯记录真正长期的交互原则；若没有长期文档，不要强行创建或要求 `Readme_GPT`。

## Validation

先读取目标仓库已有脚本，再运行对应的格式检查、构建和测试。不要假设所有项目都使用 npm、Next.js、Sites 或固定环境变量。

逐项确认：

- 控件在语义就绪前无法点击，也没有按钮外观。
- 普通文字变成按钮时没有重排、闪跳或行高变化。
- 展开完成后才测量迁移起点。
- 所有协同元素同时开始、同时结束，并落在稳定位置。
- 快速连点不会重复提交动作或重启动画。
- 减少动态效果模式直接到达同一最终状态。
- 桌面与窄屏均无重叠、裁切和横向溢出。

只有目标项目本身包含 `.openai/hosting.json` 时，才使用 Sites 发布流程；仅修改 Skill 或文档时不创建站点版本。
