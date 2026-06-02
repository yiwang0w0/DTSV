# DTSV Session Checkpoint — 2026-05-29

> 给未来 Claude 会话用：读这个就够了，不用回放整段对话。配合 `~/.claude/skills/dtsv-dev/SKILL.md` 即可上下文重建。

## 工作目录约定

- 主仓: `D:/Fragments/DTSV/` (本地 main 已 stale, 不在它操作)
- **唯一工作目录**: `D:/Fragments/DTSV/.claude/worktrees/suspicious-solomon-598909/` (分支 claude/suspicious-solomon-598909, 推 origin/main)
- 所有 reports/research/scripts/src 改动都在 worktree 里 commit + push

## Phase 完成度（截至 2026-05-29）

| Phase | 主题 | 状态 |
|---|---|---|
| 18-22 | 三链残片 / chamber / 路径 / 点数监控 | ✅ |
| 24a | 残片 lore 重写 (F01-F15) + per-player 可见性 | ✅ |
| 24b | 4 类点数经济 + shop + 入场购买 (PrepareModal) | ✅ |
| 24c | 11 职业 + perks 白名单 + 保底 | ✅ |
| 25 + 25b-25o | 数据驱动平衡 + 经济版本号/wipe + death log 字段/UI + 探针 telemetry/通知/匿名化/长尾衰减/密度上限/Nemesis 配对 / chamber_residue / 季赛预埋 / 通胀监控 / 保险 schema / Streak-breaker / 新手 F01-F03 boost / 兑换汇率 0.70 / first_raids_count / saved_loadouts / is_main_story / starter_contracts | ✅ |
| 26 | 自动健康检查 + 调研 + scheduled tasks | ✅ |
| 27 | 角色立绘系统(预设/上传/审核) | ✅ |
| 28-profile | 个人主页 `/profile`(立绘+账户配置集中化) | ✅ |

## 自动驱动基础设施

**Scheduled tasks** (持久存储 `C:\Users\29492\.claude\scheduled-tasks\<id>\SKILL.md`):

- `dtsv-healthcheck-daily` (每小时 :17 / 实际 :22) — Step 0-5: pull → 选第一个 P0/P1 → lock+push → 实现 → lint → close push (无任务时 fallback healthcheck)
- `dtsv-research-weekly` (每小时 :43 / 实际 :52) — 当日 5 主题 A-E 轮换,完成则 noop

**两个 task 路径统一到 worktree 绝对路径** (`D:/Fragments/DTSV/.claude/worktrees/suspicious-solomon-598909/...`)。

## 当前 TODO 队列（worktree/reports/TODO_AUTO.md）

**已 DONE**: 30+ 条 (含 2026-05-12 baseline 转格式后 7 条 + 27/28 批 9 条 + 29 批 1-2 条)

**待推进 (按优先级)**:
- `[research-2026-05-29-A]` **P0** — 审计 endings.js 结局语义(非账号通关墙)
- `[research-2026-05-29-A]` **P0** — ExtractionModal 撤离信号锁定窗口(N 回合脆弱态)
- `[research-2026-05-29-A]` **P1** — PrepareModal 本局目标 + 评级横幅
- `[research-2026-05-29-E]` **P0** — 探针属性按遭遇者实力缩放 + 硬封顶 (probes.js scaleProbeToEncounter 已 export,待集成 tryEncounterProbe)
- 其他 29 系列若干 (research task 持续追加)

## 关键 SQL 部署历史 (postgres MCP 已部署)

`scripts/phase-XX-*.sql`:
- 24a 残片 lore + 25b 经济版本号 + 25c death log + 25d probe telemetry + 25e player_notifications + 25f seasonal_expeditions + 25g raid_stats 经济埋点 + 25h equipment insurance + 25i chamber_residue + 25j probe_encounter_pairs + 25k 兑换汇率调整 + 25l first_raids_count + 25m saved_loadouts + 25n is_main_story + 25o starter contracts

## 关键文件索引（worktree）

- `src/lib/server/{points,shop,classes,probes,fragments,deathLog,portraits,gameActions,newbieProtection,loadoutPresets,raids,nemesis,chamberResidue}.js`
- `src/app/admin/_tabs/{Items,Npcs,Maps,Rooms,Rules,Equipment,Contracts,Events,Branches,Endings,Fragments,FragmentCombos,Chambers,Shop,PointsConfig,Classes,Portraits,Playtest,DbConsole,ProbeTelemetry}Tab.jsx`
- `src/app/{rooms,archive,codex,contracts,stash,profile,game/[id]}/page.js`
- `src/app/api/{game,admin,contracts,events,endings,branches,portraits,classes,profile}/...`
- `src/components/{PrepareModal,PortraitDisplay,PortraitSelectorModal,DeathReviewModal,OmegaCountdown,ExtractionModal,LoadoutModal}.jsx`
- `docs/{lore-minimum-viable,narrative-vision,economy-canon,session-checkpoint}.md`
- `scripts/healthcheck-spec.md` / `scripts/research-spec.md` — 两个 scheduled task 的 spec
- `reports/{baseline,TODO_AUTO}.md` + `reports/healthcheck-YYYY-MM-DD-HH.md`
- `research/notes-YYYY-MM-DD-<theme>.md`

## 现网生产 DB 状态摘要

```
fragment_pool         = 15 (F01-F15)
chamber_templates     = 25 enabled
classes               = 11 (8 normal + 3 legendary)
shop_catalog          = 30 (21 公开 + 9 class-locked)
shop_exchange_rates   = 7 (含 25k 调整后 high→low 1:7)
player_points         = 1 user 65 item_pt (1 个测试账号)
raid_stats            = 0 (pre-launch)
player_class_runs     = 0 (pre-launch)
cross_room_probes     = 0 active (pre-launch)
portraits             = 3 placeholder presets
```

## 关键约定

- 提交格式: `feat(XX.Y) | feat(auto-todo) | docs(...) | fix(...) | chore(...)` + Co-Authored-By Claude 尾签
- 推送: `git push origin claude/suspicious-solomon-598909:main` (fast-forward)
- SQL 必须防御性 `IF NOT EXISTS` 幂等
- 不动现有表 DROP/TRUNCATE, 不删 src/ 文件, 不重命名路由
- Readme_Claude 是权威变更日志, Readme_GPT 不动
- 用户偏好: 不需要中途请示, 自主判断, 完成报告
- postgres MCP 已配 service-role, 可直接 query
- dtsv-dev skill 在 `~/.claude/skills/dtsv-dev/SKILL.md`

## 用户最近反馈

- ✅ 立绘选择移到 /profile 个人主页, 游戏内只读 (Phase 28-profile)
- ⏳ 待: 等 scheduled task 持续推进 29-A 队列 + 真实玩家局产生 raid_stats 后做数据驱动调参
