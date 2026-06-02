# 调研笔记 2026-06-03 — 时间跳跃BR 重建决策调研

> 目的：在"全力实时 BR 重建"前，对 5 个决定游戏形态/技术栈的方向做外部调研，给决策锁定提供依据。
> 配套：`docs/timejump-br-design.md` §0.1 锁定决策。

## 1. 架构（web 实时多人）

- 权威服务器 = 单一真相源，是大规模实时的黄金标准；事件溯源支撑异步一致性。
- Supabase Realtime = Postgres 上的 WebSocket 层（Broadcast + Presence 已 GA），**低消息量便宜好用**；但高频实时规模成本陡增（10K 高级并发 ~$11K/月）。专用实时引擎（Colyseus / 专用 WS / UE）才是 twitch 级的路。
- **→ 决策**：玩法粒度锁 **动作级·慢节拍** → 事件溯源 + 服务器权威 + 复用 Supabase，消息量低、成本可控、复用现有动作分发模型。twitch 级会脱离当前栈、成本与工程量翻数倍。

## 2. BR 节奏

- 玩家数 AAA 100–150，但那是 twitch + 海量玩家池。
- 对局时长甜区 **20–25 分钟**（Apex/Fortnite 调到这窗口）；分阶段（非连续缩圈）维持张力、避免全程高压疲劳。
- **→ 决策**：人数锁 **16–24**（web 慢节拍易填房）；时长用户选 **60min（15min×5）** —— 偏向"战略"体验而非 BR 引擎甜区，已知单局偏长，靠 dev 短 phase 局走查、后续可按留存数据回调。

## 3. 撤离类死亡惩罚

- Tarkov 全损 = 硬核窄众（2025-11 峰值 47.8K）；Arc Raiders 温和（丢本局物资、不动账号进度）= 休闲友好（峰值 481K，~10× Tarkov）。
- 保险/buy-back 被反复点名为降"装备恐惧"的关键；**严苛惩罚是新人流失第一主因**。
- **→ 决策**：死亡惩罚锁 **温和 + 保险**。死亡只丢本局未撤离物资、保留账号点数/进度；保险返还复用现有 `equipment_insurance_tier` schema。与现有 newbie protection / streak-breaker 一致。

## 4. 异步 / 时间不对称

- 黑魂留言+血迹、死亡搁浅痕迹 = 跨实例异步交互成熟范式；黑魂=对抗式、死搁=协作式。
- **→ 决策**：现有异步探针重构为"跳跃者残影"（黑魂式·对抗），呼应规则书"跳跃者留下可被察觉残影、书写者主动猎杀"的设定。

## 5. 直播 / VTB 联动

- Crowd Control = 事实标准（观众经 Twitch 扩展/订阅/bits 触发游戏内效果，100+ 游戏、70K 创作者）；设计维度 Agency / Pacing / Community。VTube 经 VTube Studio/VSeeFace 接。
- BR 播报层（第21房热点图 / 预言广播）本身就是天然观战内容。
- **→ 决策**：本期只把播报/事件系统做成"可外部消费"(feed-API-ready)；Crowd Control / VTube 完整接入留 Phase 37+。

## Sources

- Supabase Realtime GA — https://supabase.com/blog/supabase-realtime-multiplayer-general-availability
- Realtime 成本讨论 — https://github.com/orgs/supabase/discussions/39653
- BR 时长 (TheGamer) — https://www.thegamer.com/fortnite-game-length-time-record/
- Arc Raiders vs Tarkov 直播数据 (Streams Charts) — https://streamscharts.com/news/extraction-shooters-level-tarkov-vs-arc-raiders-livestream-spotlight
- Tarkov lead 评 Arc Raiders (PC Gamer) — https://www.pcgamer.com/games/fps/tarkov-lead-vows-to-make-the-upcoming-fragmentary-order-the-opposite-of-arc-raiders-which-he-calls-an-extraction-shooter-for-casual-people/
- 异步多人 (Goomba Stomp) — https://goombastomp.com/asynchronous-death-stranding/
- Crowd Control — https://crowdcontrol.live/twitch/
