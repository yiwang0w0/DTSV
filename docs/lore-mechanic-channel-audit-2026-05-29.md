# 机制/叙事双频道隔离审计（research-2026-05-29-C P1）

> 审计时间：2026-05-29
> 审计范围：`src/lib/server/fragments.js`、`src/app/game/[id]/GameClientPage.jsx`（loreInjection 渲染）
> 设计依据：Cultist Simulator 证据——晦涩游戏劝退主因是**机制晦涩**而非**叙事晦涩**。
> 体裁铁律：**叙事可晦涩、机制必清晰**。lore 只描述世界，绝不承载机制指令（"该往哪走 / 该用什么 / 目标是什么"）。
> 配套宪法条款：[narrative-vision.md §6.4](./narrative-vision.md#64-机制叙事双频道隔离research-2026-05-29-c-p1)

---

## 一、审计结论：PASS（代码层），残余风险在内容层

代码 / 渲染层**已结构性隔离**两个频道，lore 文本永不被解析驱动机制决策。唯一残余风险是 DB 作者在 `fragment_pool.description` / `lore_chunk_pool` 里写出指令式文案——由 §6.4 的作者纪律 + PR 清单约束，非代码问题。

---

## 二、证据链

### A. `src/lib/server/fragments.js` —— 0 行 lore 文本

- 该文件是**纯解码 / 发现逻辑**：`discoverFragment` / `evaluateFragmentCombos` / `weightedPick`。
- 全文唯一的文本引用是从 DB 读出的 `target.name`（残片名）与 `console.warn` 调试串，**不内联任何 lore 正文，更无机制指令文本**。
- 残片正文（`description` / `lore_full` / `lore_chunk_pool`）全部 DB 驱动，源码不持有。
- **结论**：fragments.js 不可能泄露"机制指令藏在 lore 里"——它根本不碰 lore 文本。

### B. `GameClientPage.jsx` `filterLore()` —— 纯文本频道追加，无解析

```
const visible = (chamber.loreInjections || [])
  .filter(inj => inj.sourceFragmentId == null || myDecodedIds.has(inj.sourceFragmentId))
  .map(inj => inj.text)
const combined = base ? `${base}\n${visible.join('\n')}` : visible.join('\n')
return { ...chamber, description: combined }
```

- loreInjection 只做一件事：把已解码残片对应的 `text` **字符串拼接**进 `chamber.description`（叙事频道）。
- **从不 parse lore 文本去计算任何机制值**——不抽取方向、不抽取道具名、不抽取目标。
- 可见性过滤基于结构化的 `sourceFragmentId` + 玩家解码集合，与文本内容无关。

### C. 机制频道完全独立且清晰（与叙事频道零交叉）

| 玩家需要的机制信息 | 走哪个频道（清晰、结构化） | 源 |
|---|---|---|
| 该往哪走 | A/B/C 导航按钮 `optionLabel` | GameClientPage `nextChamberOptions` |
| 该用什么 / 撤离门槛 | `exit_cost` 显式"需 X ×N" | `effectiveMapConfig.exit_cost` |
| 这里多危险 | 区域评估·战斗强度标签 | `regionAssessment.combatLabel` |
| 能不能撤出去 | 撤离成功率**数值百分比** | `regionAssessment.extractRate` |

- 上述机制信息均来自结构化字段（`exitCost` / `pollutionBase` / `regionAssessment` / `optionLabel`），**与 `description` 文本频道物理隔离**。
- `description`（base 环境描述 + 追加的 loreInjection）= 叙事频道，可晦涩；上表 = 机制频道，必清晰。两者在渲染层是不同的 UI 卡片，不互相派生。

---

## 三、给后续 Phase 的约束（已写入宪法 §6.4）

1. 任何新增残片 / loreInjection / chamber 描述文案，**禁止**写"往左走 / 先用 X / 你的目标是 Y"式机制指令；机制引导一律走结构化 UI。
2. 任何"玩家该怎么操作"的提示，必须有独立于 lore 文本的清晰机制频道承载（按钮 / 数值 / 标签）。
3. 不得新增"解析 lore 文本→驱动机制"的代码路径（例如从残片正文里正则抽取出口方向）。
4. PR 审查清单新增一项：改 `fragment_pool` / `loreInjections` / chamber 描述时勾选"未在 lore 文本里写机制指令"。

---

## 四、附：为什么这是"防最大流失旋钮"

Cultist Simulator / Tarkov 的玩家研究反复显示：玩家能忍受**看不懂故事**（甚至以此为乐），但无法忍受**看不懂怎么玩**。把这两个频道焊死隔离，等于把"叙事晦涩"的留存优势保住、把"机制晦涩"的劝退风险归零——改动成本极低（主要是作者纪律），收益是体裁里最大的单点流失防护。
