// KALEIDO 单人壳 · 纯展示组件（KP0-C ③④）
//   全部 props 驱动、无 state、无副作用（沿用 gameUi 的纯组件风格），供 GameClientPage 的 kaleido
//   分支渲染，也可在 dev 预览页单独挂载验证。数据形态见 docs/plan/kaleido/00-spec-v0.3.md §6.1 Level Schema。
//   P0 阶段 env_rules/formula_overrides 多为空 → 每个容器都带优雅空态。
//   ⚠ combat_mode 的权威中文说明来自 ⚙️ 的 combatModes 注册表 describe()；此处 describeCombatMode 是
//     客户端占位（联调后可改为消费服务端返回的 describe 文案）。

import { T, Btn, PanelTitle } from '../gameUi'

// ── 中文 describe 助手（纯函数，可独立测试）──────────────────────────────

// exit_condition → 一句话中文目标。类型见 §6.1 / §2.6：boss_kill | survive_turns | collect。
export function describeExitCondition(ec) {
  if (!ec || !ec.type) return '达成关卡目标'
  const p = ec.params || {}
  switch (ec.type) {
    case 'boss_kill':
      return p.name ? `击败首领「${p.name}」` : '击败本关首领'
    case 'survive_turns':
      return `存活 ${p.turns ?? '?'} 回合`
    case 'collect':
      return `收集 ${p.count ?? '?'} 个${p.target ? `「${p.target}」` : '目标物'}`
    default:
      return '达成关卡目标'
  }
}

// combat_mode → 中文规则摘要（R6 生效前展示素材）。template_ref 见 §3.3。
export function describeCombatMode(cm) {
  if (!cm || !cm.template_ref) return { title: '标准回合战', desc: '攻击与反击交替的标准回合制结算。' }
  const p = cm.params || {}
  switch (cm.template_ref) {
    case 'standard':
      return { title: '标准回合战', desc: '攻击与反击交替的标准回合制结算。' }
    case 'gauntlet':
      return { title: `波次战 · ${p.waves ?? '?'} 波`, desc: '连续多波敌人，波间可整备。撑过全部波次即胜。' }
    case 'stance_duel':
      return { title: '三态对决', desc: '攻 / 守 / 技 三态互相克制，猜中加成。入关前可查看克制表。' }
    default:
      return { title: cm.template_ref, desc: '自定义回合制变体。' }
  }
}

// env_rule → 中文条目。已知键给友好名，未知键回退「键 = 值」。
const ENV_RULE_LABELS = {
  pollution_accel: '污染加速',
  search_bonus: '搜索加成',
  npc_atk_mult: '敌方攻击倍率',
  npc_def_mult: '敌方防御倍率',
  loot_weight: '掉落权重',
  omega_window: 'Ω 窗口',
}
export function describeEnvRule(r) {
  if (!r || !r.rule_key) return null
  const label = ENV_RULE_LABELS[r.rule_key] || r.rule_key
  return `${label}：${r.value}`
}

// formula_override → 中文条目。target 白名单见 §3.4：damage | defense | crit。
const FORMULA_TARGET_LABELS = { damage: '伤害', defense: '防御', crit: '暴击' }
export function describeFormulaOverride(f) {
  if (!f || !f.target) return null
  const label = FORMULA_TARGET_LABELS[f.target] || f.target
  return { label, formula: f.formula || '—' }
}

// ── 大厅「单人出勤」入口卡（KP0-C ①）──────────────────────────────────────
//   纯展示：onStart/starting/error/disabled 由 /rooms 注入（调 startKaleidoRun）。
//   KALEIDO 是新核心主线 → 视觉上做成大厅的主 CTA（紫色系与多人绿色 CTA 区分）。
export function KaleidoEntryCard({ onStart, starting = false, error, disabled = false }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${T.purple}14 0%, ${T.bg2} 55%)`,
        border: `1px solid ${T.purple}55`,
        borderLeft: `3px solid ${T.purple}`,
        borderRadius: 14,
        padding: '18px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>🔮</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>单人出勤 · 万华镜</span>
          <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: `${T.purple}22`, color: T.purple, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            NEW
          </span>
        </div>
        <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.5 }}>
          回合制 · 5 关一局 · 每次都是全新生成的单人 run。独自探索，通关或阵亡即收敛。
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: T.yellow }}>⚠ {error}</div>}
      </div>
      <Btn
        variant="primary"
        size="lg"
        onClick={onStart}
        disabled={disabled}
        loading={starting}
        loadingText="生成中…"
        sx={{ background: T.purple, color: '#fff', whiteSpace: 'nowrap' }}
      >
        ▶ 开始单人 run
      </Btn>
    </div>
  )
}

// ── 关卡头（顶部 · 第 N/5 关 · 回合数 · 目标）──────────────────────────────
export function KaleidoLevelHeader({ seq = 1, levelCount = 5, turnCount = 0, exitCondition }) {
  const pct = Math.max(0, Math.min(100, (seq / levelCount) * 100))
  return (
    <div style={{ background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`, borderBottom: `1px solid ${T.border}`, padding: '10px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: T.dim, textTransform: 'uppercase', letterSpacing: 1 }}>关卡</span>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontWeight: 800, fontSize: 22, color: T.cyan, lineHeight: 1 }}>{seq}</span>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 13, color: T.dim }}>/ {levelCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1 }}>回合</span>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontWeight: 700, fontSize: 16, color: T.text, lineHeight: 1 }}>{turnCount}</span>
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: T.yellow, whiteSpace: 'nowrap' }}>🎯 {describeExitCondition(exitCondition)}</span>
      </div>
      {/* 进度条：已到第 seq 关 */}
      <div style={{ marginTop: 8, height: 3, background: T.bg0, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: T.cyan, borderRadius: 2, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

// ── 本关规则卡（R6 · 生效前展示）──────────────────────────────────────────
//   战斗模式恒有；env_rules / formula_overrides P0 多为空 → 空态提示「沿用默认」。
export function KaleidoRuleCard({ combatMode, envRules = [], formulaOverrides = [], style = {} }) {
  const mode = describeCombatMode(combatMode)
  const envItems = (envRules || []).map(describeEnvRule).filter(Boolean)
  const fxItems = (formulaOverrides || []).map(describeFormulaOverride).filter(Boolean)
  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', ...style }}>
      <PanelTitle right={<span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: T.dim }}>进入前可见</span>}>
        📋 本关规则
      </PanelTitle>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 战斗模式 */}
        <div>
          <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>战斗模式</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.cyan }}>{mode.title}</div>
          <div style={{ fontSize: 12, color: T.dimB, marginTop: 2, lineHeight: 1.5 }}>{mode.desc}</div>
        </div>
        {/* 环境规则 */}
        <div>
          <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>环境规则</div>
          {envItems.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {envItems.map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: T.text }}>· {t}</div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.dim, fontStyle: 'italic' }}>本关无特殊环境规则</div>
          )}
        </div>
        {/* 公式覆盖 */}
        <div>
          <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>结算公式</div>
          {fxItems.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {fxItems.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: T.text }}>
                  <span style={{ color: T.yellow }}>{f.label}</span>
                  <span style={{ color: T.dim }}> ← </span>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11 }}>{f.formula}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.dim, fontStyle: 'italic' }}>沿用默认结算公式</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 关间横幅（level_clear · 通过某关 → 进入下一关）────────────────────────────
export function KaleidoLevelClearBanner({ seq, nextSeq, levelCount = 5, onContinue }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center', maxWidth: 340 }}>
        <div style={{ fontSize: 12, color: T.green, textTransform: 'uppercase', letterSpacing: 2 }}>LEVEL CLEAR</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.text, margin: '6px 0 2px' }}>第 {seq} 关 · 通过</div>
        <div style={{ fontSize: 13, color: T.dim, marginBottom: 18 }}>
          接下来 · 第 <span style={{ color: T.cyan, fontWeight: 700 }}>{nextSeq}</span> / {levelCount} 关
        </div>
        <Btn variant="primary" size="lg" onClick={onContinue} sx={{ width: '100%' }}>进入第 {nextSeq} 关 →</Btn>
      </div>
    </div>
  )
}

// ── 收敛页（版本终止 · 通关或死亡 · R8/R9）────────────────────────────────
//   summary: { levelsCleared, levelCount, totalTurns, kills, itemsFound, cause? }
export function KaleidoConvergenceScreen({ status = 'cleared', summary = {}, onRestart, onLobby }) {
  const dead = status === 'dead'
  const accent = dead ? T.red : T.green
  const {
    levelsCleared = 0, levelCount = 5, totalTurns = 0, kills = 0, itemsFound = 0, cause,
  } = summary
  const stats = [
    { label: '通关进度', value: `${levelsCleared}/${levelCount}` },
    { label: '总回合', value: totalTurns },
    { label: '击败', value: kills },
    { label: '获得道具', value: itemsFound },
  ]
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 420, width: '100%' }}>
        {/* 结果头 */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: accent, textTransform: 'uppercase', letterSpacing: 3 }}>
            {dead ? 'VERSION ENDED' : 'RUN CLEARED'}
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: accent, margin: '4px 0', textShadow: `0 0 20px ${accent}44` }}>
            {dead ? '阵亡' : '通关'}
          </div>
          {dead && cause && <div style={{ fontSize: 12, color: T.dim }}>{cause}</div>}
        </div>
        {/* run 摘要 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, margin: '14px 0' }}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.dim, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {/* 图鉴占位（收敛图鉴 · §5.10；P0 先占位）*/}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>收敛图鉴</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ aspectRatio: '1 / 1', borderRadius: 6, background: T.bg2, border: `1px dashed ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, fontSize: 16 }}>
                {i < levelsCleared ? '◆' : '◇'}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 6, fontStyle: 'italic' }}>本 run 生成内容图鉴 · 即将开放</div>
        </div>
        {/* 动作 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="primary" size="lg" onClick={onRestart} sx={{ flex: 1 }}>再来一次</Btn>
          <Btn variant="ghost" size="lg" onClick={onLobby} sx={{ flex: 1 }}>返回大厅</Btn>
        </div>
      </div>
    </div>
  )
}

// ── 共用样式（覆盖层 + 卡片）──────────────────────────────────────────────
const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 900,
  background: 'rgba(1, 4, 9, 0.82)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
}
const cardStyle = {
  background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
  border: `1px solid ${T.borderB}`, borderRadius: 16,
  padding: '22px 20px', display: 'flex', flexDirection: 'column',
  boxShadow: '0 12px 48px rgba(0,0,0,0.6)', animation: 'fadeIn 0.3s ease-out',
}
