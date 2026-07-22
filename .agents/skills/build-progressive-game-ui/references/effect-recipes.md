# Progressive UI Effect Recipes

这里记录不依赖特定仓库路径的实现骨架。目标项目代码始终是最终事实来源；示例时长仅用于说明时序关系。

## Contents

- [Text Becomes Action](#text-becomes-action)
- [Expandable Panel](#expandable-panel)
- [Synchronized Wrap Transition](#synchronized-wrap-transition)
- [Action Fill](#action-fill)
- [Decoded Text](#decoded-text)
- [Timing Gates](#timing-gates)
- [Failure Patterns](#failure-patterns)

## Text Becomes Action

用结构化元数据标记可交互词，不要从整句字符串里搜索并替换。按钮未就绪时渲染同尺寸文字节点：

```jsx
{actionReady ? (
  <button className="inline-action is-arming" onClick={activate}>
    状态
  </button>
) : (
  <span className="inline-action-pending">状态</span>
)}
```

```css
.inline-action,
.inline-action-pending {
  display: inline;
  padding: 0;
  border: 0;
  font: inherit;
  line-height: inherit;
  letter-spacing: 0;
}
```

按钮形态只增加颜色、下划线、微弱辉光和可点击反馈，不改变占位尺寸。用 `disabled` 保护已提交状态，但不要在尚未解锁时提前渲染一个灰色按钮。

## Expandable Panel

让现有面板向下生长。CSS Grid 的 `0fr -> 1fr` 比硬编码高度更适合未来内容：

```css
.details {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
}

.details.is-expanding {
  animation: expand-details 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.details-inner {
  min-height: 0;
  overflow: hidden;
}

@keyframes expand-details {
  to { grid-template-rows: 1fr; opacity: 1; }
}
```

用 `revealed` 控制节点是否存在，用 `expanded` 标记动画已经结束。`animationend` 回调先检查 `event.currentTarget === event.target`，再设置完成状态；同时设置略长于 CSS 时长的兜底定时器。

## Synchronized Wrap Transition

把需要协同的元素放入同一个启动函数，在同一次状态更新中切换：

```jsx
setStatusFlight(measureFlight());
setStatusStage('flying');
setDialogFramed(true);
setDialogDocked(true);
```

状态框和按钮共用一套关键帧：前段向右退出，中点瞬时换到左侧画外，后段从左侧进入目标位置。对话框用相同 `900ms` 时长靠右停驻。不要为三个元素分别串联 `setTimeout` 或 `requestAnimationFrame`。

飞行克隆使用 `position: fixed`，尺寸来自稳定布局的 `getBoundingClientRect()`；原位置保留与来源高度一致的占位。动画结束后一次性切到 `docked`，移除克隆。

## Action Fill

点击后立刻锁定动作，用伪元素或独立背景层在 `1000ms` 内从左到右填充；填满后才提交结果：

```jsx
if (actionLock.current) return;
actionLock.current = true;
setActionPending(true);
window.setTimeout(commitAction, SEARCH_COMMIT_DELAY);
```

填充层必须在文字下方，按钮文字和图标保持稳定。提交或卸载时清理定时器；失败时解除锁定并恢复可点击状态。

## Decoded Text

文字解码分离“最终字符串”和“当前显示字符串”。逐步固定已解析字符，仅随机化尚未解析的字符；不要改变容器宽度。可用两层轻微偏色的伪影制造短暂故障感，但主文字始终可读。

把解码、定格、遮黑、导航和退场设为不同阶段。`prefers-reduced-motion` 下跳过乱码循环，直接显示最终文本并完成同一导航结果。

## Timing Gates

一组可调整的基准常量：

```js
const SEARCH_COMMIT_DELAY = 1000;
const DIALOG_SETTLE_PAUSE = 180;
const STAMINA_EXPAND_MS = 640;
const LAYOUT_TRANSITION_MS = 900;
```

这些数值对应远星参考开局；其他项目按节奏调整。JS 常量与 CSS 动画时长必须同步。关键流程优先由动画结束事件推进，定时器只作为兜底。新的时长集中定义，不要把魔法数字散落在事件处理器里。

## Failure Patterns

- 在玩家理解概念前展示禁用按钮或完整 HUD。
- 对协同元素使用彼此独立、串联的计时器，造成先后错位。
- 在文字仍入场或面板仍展开时调用 `getBoundingClientRect()`。
- 通过解析叙事字符串寻找可点击词，而不是给叙事片段添加结构化交互元数据。
- 动画中途卸载来源却不保留占位，导致页面回流。
- 因 React 重渲染重新触发一次性动画。
- 减少动态效果模式跳过了状态提交，只隐藏了动画。
