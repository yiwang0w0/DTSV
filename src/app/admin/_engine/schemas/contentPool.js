/**
 * contentPool.js — KALEIDO 内容池 / 种子关策展 schema（内容引擎顶层内容类型）。
 *
 * 驱动 content_pool 表（docs/plan/kaleido/02-detailed-design §2.3）。P1 用于手工策展种子关
 * （entity_type='level' + Level Schema v0.3 payload），也承载晋升机制回灌的共享内容。
 *
 * 写路径：内容引擎统一走 postGameApi('/api/admin/content')（service_role）。
 *   content_pool 表出生即 RLS（写仅 service_role），故 anon 直写会被拒——本 schema 不做直写。
 *   服务端白名单（adminContent.js CONTENT_SCHEMAS 的 content_pool 项）归 🔒 phase-52b，与建表 SQL 同批。
 *   若白名单未落而先试保存 → 4xx（预期时序）。
 *
 * 触达：登记进 _engine/schemas/index.js 的 ENGINE_TABS 后，经 /admin?tab=contentPool 深链可达
 *   （「退役侧栏入口」模式；正式侧栏分组入口待 P1 策展启动时再与 admin 侧协调加）。
 */
const LEVEL_SKELETON = {
  seq: 1,
  combat_mode: { template_ref: 'standard', params: {} },
  env_rules: [],
  formula_overrides: [],
  event_deck: [],
  exit_condition: { type: 'boss_kill', params: {} },
  difficulty_band: { target_clear_rate: [0.4, 0.7] },
}

const contentPool = {
  key: 'contentPool',
  label: '内容池 / 种子关',
  table: 'content_pool',
  pk: 'id',
  searchFields: ['entity_type'],
  filters: [
    { field: 'entity_type', label: '类型', options: [['all', '全部'], ['level', '种子关'], ['combat_mode_params', '战斗模式参数'], ['npc', 'NPC'], ['item', '道具']] },
    { field: 'enabled', label: '状态', options: [['all', '全部'], ['true', '启用'], ['false', '禁用']] },
  ],
  summary: (row) => `[${row.entity_type || '?'}] ${row.provenance?.source || '—'}${row.id != null ? ` #${row.id}` : ''}`,
  fields: [
    {
      name: 'entity_type', type: 'select', label: '内容类型', required: true, default: 'level',
      options: [['level', '种子关 (Level Schema)'], ['combat_mode_params', '战斗模式参数'], ['npc', 'NPC'], ['item', '道具']],
      hint: 'P1 种子关策展主用 level',
    },
    {
      name: 'payload', type: 'json', label: '内容 payload', rows: 14, default: LEVEL_SKELETON,
      hint: 'entity_type=level 时为 Level Schema v0.3（docs/plan/kaleido/00-spec §6.1）。event_deck 的 npc/item 只放 ID 引用（不复制整行）。',
    },
    {
      name: 'provenance', type: 'json', label: '来源 provenance', rows: 3, default: { source: 'seed', anonymized: true },
      hint: "{ source: 'seed' | 'promoted', anonymized: true, run_id? }",
    },
    {
      name: 'live_stats', type: 'json', label: 'live 指标', rows: 3, default: {},
      hint: '晋升机制回灌用（P2）；手工策展留空 {}',
    },
    { name: 'enabled', type: 'bool', label: '启用', default: true },
  ],
}

export default contentPool
