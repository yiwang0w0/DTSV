# KALEIDO · 04 P0 闸门复审裁决(2026-07-06)

> 🧭 中控 · 对抗式复审:3 视角猎错(23 条)→ 逐条反驳验证 → **22 确认 / 1 推翻**;另独立复跑 4 份 smoke 全绿(21+29+65+21)。
> **裁决:P0 暂不过闸**。代码基座质量良好(守卫逐处核对全部逐字等价、schema 与契约一致、R9/R11/R3 合规、幂等主路径正确),但存在 1 个 HIGH 断链 + 状态机门禁缺失,验收 #1「跑通 5 关 run 且流转正确」当前不可达。修复面小且清晰,按本文件修复批(KP0-R)执行后**复验即过**。

## 0. 中性复核结论(最重要的一条先说)

- 全部 isKaleidoRoom 守卫逐处核对:非 kaleido 分支**逐字等价**,无条件写反/半开。多人局零行为变化 ✅。
- 唯一共享行为变化 = formulaSandbox 白名单收窄(🔒 #3):怀疑者连库差分实测**线上全部 19 条存量公式逐值不变**,收窄属契约内安全修复 → **采信,通过**。注:今后管理端录入白名单外构造会静默得 0 —— 后续(非阻塞)建议编辑器保存时用 `isFormulaSafe` 给即时校验提示。

## 1. 确认发现(去重后 10 组·按 owner 分)

### ⚙️ KP0-R-S(服务端修复批)

| # | 组 | 严重度 | 内容(锚点) | 中控裁决 |
|---|---|---|---|---|
| S1 | 状态机门禁 | **HIGH(合并组)** | move/advanceChamber 无过关门禁 → 7 动作速通全 run,levels 1-4 恒 'ready'、current_seq 1→5 跳变(gameActions.js:2467/3118/2490);turnCount 只在过关清零不在入关清零 → 已清关刷回合秒清下一关(:2501) | **推进门禁**:kaleido 局前进需当前关 cleared,否则报「本关目标未达成」;**turnCount 入关清零**(per-level 语义落实);survive_turns 读本关 turnCount |
| S2 | 状态机加固 | MED | ①域真源同步失败被吞后永不重判,最坏玩家锁死在已收房的房间(:2520) ②startKaleidoRun 双击并发弃置在建 run→双房(:2405) ③幂等入口不验房间存活,run active+房 gamestate=2 即永锁(:2404) | ①失败重判:advance 时若 room 已收但 runs 仍 active → 补收敛 ②建房流程持 uq_runs_one_active 兜底+先插后建房序 ③幂等返回前验房 gamestate<2,否则补收敛旧 run 开新 |
| S3 | 动词覆盖 | MED | fight_start/flee/npc_spare/npc_overkill 未发射、craft_attempt 缺 success_rate(events.js:12) | 服务端动词补齐;**P0 验收动词范围裁决**:服务端动词全量 + 客户端仅 session_end(ui_read_ms/idle_ms/hesitation_ms/return_latency 延至 P1,02 §2.4 勘误) |
| S4 | 发射可靠性 | LOW | 三处 emit 不 await,Vercel 冻结可丢事件(route.js:41; gameActions.js:2481/2532);death 事件死后每动作重复发(:2481/2478 reason 恒缺省) | kaleido 路径三处改 await(多人局不经过,延迟自担);death 只在收敛点发一次(runs 已 dead 不再发)+ 带 reason |
| S5 | beacon 加固 | LOW | run_id 不验归属;无 per-user 频控;尺寸按字符非字节;levelSeq 无钳制(beacon/route.js:44/27) | 归属:一次 select 比对 runs.player_id;频控:DB 窗口计数(宽松阈,如 60 事件/分);Buffer.byteLength;levelSeq 钳 1..LEVEL_COUNT |
| S6 | 判定字段 | LOW | collect 服务端读 params.itemName、UI describe 读 params.target(runs.js:127);boss_kill 读全局 bossDefeated 永不复位跨关粘连 | **canonical=params.itemName**,UI 对齐;kaleido 入关时重置本关 boss 状态(按 seq 记) |
| S7 | 孤儿房 | LOW | startKaleidoRun 补偿只弃 run 不删房(建房成功后续步失败 → gamestate=0 孤儿房挂大厅) | 补偿路径顺带删/收该房 |

### 🎨 KP0-R-C(客户端修复批)

| # | 组 | 严重度 | 内容(锚点) | 中控裁决 |
|---|---|---|---|---|
| C1 | **入口断链** | **HIGH** | /rooms 单人出勤卡调 `/api/kaleido/start`,实际路由 `/api/kaleido/run`(rooms/page.js:76,TODO 未清)→ 主 CTA 永远 404,整链 UI 不可达 | 改一行对齐 `/api/kaleido/run`(契约在 Readme ⚙️ 段:返回 {roomId,runId}) |
| C2 | 大厅噪音 | LOW | 大厅列表不滤 gametype=30,全服可见单人房,点入加入报错(rooms/page.js:57) | 查询/渲染过滤 gametype 30 |
| C3 | 首帧瞬时订阅 | LOW | room 未载入首帧 isKaleido=false → 先订阅后退订(GameClientPage.jsx:261) | **方案 c**:入口卡跳转带 `?kaleido=1` 提示参数,GameClientPage 以此为早期提示跳过首帧订阅(多人链接永不带 → 严格中性);若实现别扭可降级为「记录为已知瞬态」 |
| C4 | ② 收尾 | LOW | 撤离入口未按 §2.1 隐藏;关卡头/横幅/收敛页壳组件未接入 /game/[id](GameClientPage.jsx:707) | 即 KP0-C② 剩余工作,照原派单 |
| C5 | beacon 发射端 | MED(补) | 客户端无任何 beacon 调用,session_end 无来源 | `navigator.sendBeacon` + visibilitychange:上报 session_end(context: after_death/after_clear/mid_combat/idle);其余客户端动词 P1 |

### 🔒(非阻塞跟进)

- ⚙️ S5 落地后对 beacon 做一次快速复审(你 #2 的两条 finding 即 S5,闭环)。
- (低优)admin 公式编辑器保存时用 isFormulaSafe 即时提示,防未来录入静默归 0。

## 2. 复验标准(过闸条件)

1. C1+S1 落地后,浏览器完整跑通 5 关 run **通关一次 + 死亡一次**(闸门验收人:🧭 中控/Kanata);run/levels/rooms 三态流转正确(无 'ready' 空洞、current_seq 逐级)。
2. player_events:服务端动词全量 + session_end 有行,level_seq 标注正确。
3. smoke/build 全绿;多人局回归声明不变。
4. S2-S7/C2-C5 全部落地或明确标注延期理由。

## 3. 附:复审通过项(摘要)

守卫 5+2 处逐字等价 / schema 与 DDL 草案逐列一致(4 个增强索引含 uq_runs_one_active 兜底) / R9·R11·R3(P0 采样域)合规 / 幂等+补偿主路径正确 / 采样器 mulberry32 确定性 / beacon 信任边界(除 S5)/ kaleidoShell 零副作用无 mock 泄漏 / 死亡先于过关判定(R9 优先级正确) / 异常留痕 console.error 无无声吞错。
