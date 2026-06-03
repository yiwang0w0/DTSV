-- ============================================================
-- Phase 33 — 地图编辑器地基：br_rooms.updated_at（拓扑版本戳）+ 自动维护触发器
-- ============================================================
-- 来源: 【D·SQL】契约 — 为后续「BR 拓扑编辑器」提供一个 *拓扑版本* 锚点。
--
-- 用途 / WHY:
--   br_rooms 是 BR「静态拓扑」唯一权威表（room_id/label/region/neighbor_ids/grid_x/grid_y/
--   close_phase/enabled）。它被两条只读路径消费：
--     • 服务端 getRaidLayout(seed)（raidLayout.js，进程级 memo）→ 派生 rooms/adj/templateMeta；
--     • 客户端 GET /api/br/topology（route.js）→ 以 `Cache-Control: public, max-age=86400, immutable`
--       跨对局/跨组件**长缓存一次**拓扑几何。
--   编辑器要能改这张表（移动格子、重连邻接、改名/分区、增删可用房）。但 immutable 长缓存 + 进程 memo
--   意味着「改了 DB，客户端/服务端可能仍拿旧拓扑」。需要一个**单调推进的版本量**让运行时与缓存能
--   感知「拓扑变过了」并据此失效缓存 / 决定能否在飞局上改结构。
--   本列 updated_at 即该版本量：任何一行 UPDATE 都自动把它推到 now()（见触发器），
--   编辑器无需手动维护；运行时取 max(updated_at) 即「当前拓扑版本」。
--
-- ── 红线对齐（本 migration 不触碰任何运行时判定，仅加一个时间戳列 + 触发器）──────────
--   ① 致死一致性不变量（**核心**）：
--      缩圈致死的**唯一权威**不是 br_rooms，而是每局开局冻结进 rooms.gamevars.br 的快照：
--        - gamevars.br.closePhases { [roomId]: closePhase }（客户端逐格着色 + 服务端生死判据，按
--          stable roomId 键）——由 forbidden.js::computeClosePhases(seed) 在 joinRoom 时算一次后**永不变**；
--        - gamevars.br.roomTemplates { [roomId]: templateId }（铺货/伪 chamber）同样开局冻结。
--      因此「快照致死 == 客户端着色」逐格一致，且**与 br_rooms 当前内容解耦**：在飞局（rooms.gamestate=1）
--      永远用自己 gamevars.br 快照，编辑器改 br_rooms **不会**改写已开局的 closePhases/roomTemplates。
--      ⇒ 致死/着色不变量被 gamevars 快照保护，本列不参与、也不得参与生死判定。
--      ⚠ 几何漂移（编辑器义务，非本 SQL 强制）：closePhases 按 roomId 键 → 生死永远对齐；但拓扑**几何**
--        （grid_x/grid_y/neighbor_ids）走的是 live br_rooms。若在飞局期间把某 roomId 的坐标/邻接挪走，
--        新拉 /api/br/topology 的客户端会看到格子位置/移动邻接变化（生死仍正确，但视觉/可达性漂移）。
--        故编辑器应：以 max(updated_at) 为拓扑版本 →（a）作 /api/br/topology 的缓存键/ETag 使 immutable
--        缓存可失效；（b）在存在 gamestate=1 的飞局时，对**结构性改动**（坐标/邻接/启停）给出守卫或将
--        飞局钉死在其开局拓扑版本。本列是实现以上策略的版本来源，策略落地由应用层（主代理）接线。
--   ② 不破现有 100 格局（回归）：纯 ADD COLUMN（DEFAULT now() 回填）+ 加触发器；不改任何既有列、
--      不动种子数据、不改 close_phase/neighbor_ids/grid_*。现有 100 房布局零改动。
--   ③ 缩圈/铺货随机用现有种子 PRNG：close_phase 与 loot 由 forbidden.js 的 xmur3/mulberry32 按 per-raid
--      seed 确定性派生（computeClosePhases / lootTier），**不读本列、不读 br_rooms.close_phase 作判据**。
--      本列只是时间戳，绝不引入任何随机；每局确定性不受影响。
--   ④ 残片可发现性 / 六纪元 lore / 装备系统：完全不碰（本文件只触及 br_rooms 一列 + 一个触发器）。
--   ⑤ 幂等：ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE
--      TRIGGER（重跑先删后建，不报「already exists」）。可安全重复执行。
--
-- 设计:
--   1) br_rooms ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
--      —— 既有行被 DEFAULT 回填为执行时刻（统一基线版本）；新行默认 now()。
--   2) 触发器 br_rooms_set_updated_at（BEFORE UPDATE FOR EACH ROW）：每次行更新强制
--      NEW.updated_at = now()，使「拓扑版本」对**任何**写入者（编辑器 / 直连 SQL / admin）自动推进，
--      不依赖调用方记得 set。仅 UPDATE 触发（INSERT 用列 DEFAULT）。
--   注：本项目历来用显式 `updated_at = now()` 维护该类列（见 phase-24b/25b），但拓扑版本需对**外部编辑器
--       与手工 SQL** 也可靠推进，故此处用触发器兜底（DB 级真相），与应用层是否记得 set 无关。
--
-- ⚠ 事务: 含 CREATE FUNCTION / CREATE TRIGGER（普通 DDL，可入事务块），全文 BEGIN/COMMIT 包裹原子提交。
--
-- 不部署: 本文件**只写不跑**，由主代理审后用 postgres MCP 执行（参考 phase-32 模式）。
--
-- 验证（部署后用 pg_execute_query 跑）:
--   -- a) 列已加、类型/默认/非空正确:
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'br_rooms' AND column_name = 'updated_at';
--   -- 期望: timestamptz / NO / now()
--   -- b) 触发器存在且绑定 BEFORE UPDATE:
--   SELECT tgname, tgenabled
--     FROM pg_trigger
--    WHERE tgrelid = 'br_rooms'::regclass AND NOT tgisinternal;
--   -- 期望: 含 br_rooms_set_updated_at（tgenabled='O' 启用）
--   -- c) 当前拓扑版本（运行时/编辑器读这个）:
--   SELECT max(updated_at) AS topology_version, count(*) AS rooms FROM br_rooms;  -- rooms 期望 100
--   -- d) 触发器自动推进冒烟（dry-run，no-op 改动也应推进 updated_at；只读对照，不必真跑）:
--   --   UPDATE br_rooms SET label = label WHERE room_id = 1;  -- 之后该行 updated_at 应 > 之前
-- ============================================================

BEGIN;

-- 1. 拓扑版本戳：编辑器/任何写入推进它（DEFAULT now() 回填既有 100 行为统一基线）
ALTER TABLE br_rooms
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN br_rooms.updated_at IS
  'Phase 33 — BR 拓扑版本戳。任何行 UPDATE 经触发器 br_rooms_set_updated_at 自动推到 now()。
   运行时/编辑器以 max(updated_at) 为「当前拓扑版本」：用作 /api/br/topology 缓存键/ETag 使 immutable
   长缓存可失效，并据此守卫「在飞局(rooms.gamestate=1)上的结构性改动」。
   红线: 不参与生死/着色判定——缩圈致死权威是开局冻结的 gamevars.br.closePhases(按 roomId 键)；
   close_phase/loot 由 forbidden.js 种子 PRNG 派生，均不读本列。';

-- 2. 触发器函数：BEFORE UPDATE 强制刷新版本戳（对编辑器/直连 SQL/admin 一律生效，不靠调用方记得 set）
--    CREATE OR REPLACE ⇒ 幂等（重跑覆盖同名函数）。
CREATE OR REPLACE FUNCTION br_rooms_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION br_rooms_set_updated_at() IS
  'Phase 33 — br_rooms BEFORE UPDATE 触发器函数：每次行更新把 updated_at 推到 now()，
   使 BR 拓扑版本对任何写入者（编辑器/手工 SQL）自动单调推进。';

-- 3. 绑定触发器（先 DROP IF EXISTS 再 CREATE ⇒ 幂等重跑不报 already exists）。
--    仅 BEFORE UPDATE：INSERT 走列 DEFAULT now()，无需触发。
DROP TRIGGER IF EXISTS br_rooms_set_updated_at ON br_rooms;
CREATE TRIGGER br_rooms_set_updated_at
  BEFORE UPDATE ON br_rooms
  FOR EACH ROW
  EXECUTE FUNCTION br_rooms_set_updated_at();

COMMIT;
