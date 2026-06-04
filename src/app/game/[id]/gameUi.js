import { Modal } from '@/app/admin/_shared/ui'
import { THEME } from '@/lib/theme'

// 对局/BR 调色板：键名保留（所有消费点不变），值改为引用全站统一 THEME（GitHub-dark）。
//   此前游戏页用独立赛博青( #00d4ff/#ff4455 )，与大厅/后台的 GitHub-dark 主色突变——现统一到一套 token。
//   换肤/微调只需改 src/lib/theme.js 一处。
export const T = {
  bg0: THEME.bg,
  bg1: THEME.bgInset,
  bg2: THEME.panel,
  bg3: THEME.panel2,
  border: THEME.border,
  borderB: THEME.borderHover,
  text: THEME.text,
  dim: THEME.dim,
  dimB: THEME.dim2,
  cyan: THEME.accent,
  green: THEME.success,
  red: THEME.danger,
  yellow: THEME.warning,
  purple: THEME.purple,
  orange: THEME.orange,
}

export const SLOTS = [
  { key: 'probe', label: '探测' },
  { key: 'shield', label: '防护' },
  { key: 'weapon', label: '武器' },
  { key: 'comm', label: '通信' },
]

export function hpColor(hp, max) {
  const ratio = max > 0 ? hp / max : 0
  return ratio > 0.6 ? T.green : ratio > 0.3 ? T.yellow : T.red
}

export function HpBar({ hp, max, h = 6 }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (hp / max) * 100 : 0))
  const color = hpColor(hp, max)
  return (
    <div style={{ height: h, background: T.bg0, borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          boxShadow: `0 0 6px ${color}80`,
          transition: 'width .4s, background .3s',
          borderRadius: 3,
        }}
      />
    </div>
  )
}

// ── 体力条（BR 移动经济）─────────────────────────────────────────────
//   HpBar 同款无副作用纯组件，但配色走 cyan→teal 体系（与 HP 红/黄/绿区分）。
//   value/max 由 GameClientPage 用 stamina.js 的 effectiveStamina(nowMs)/maxStamina 派生，
//   依赖已有 nowMs 1s tick ⇒ transition:'width .4s' 让每秒 +REGEN_PER_SEC 平滑增长。
//   nextCost：下一次移动的预估消耗（moveStaminaCost）；value<nextCost ⇒ 体力不足，转黄/红警示。
export function staminaColor(value, max, nextCost) {
  if (Number.isFinite(nextCost) && value < nextCost) return T.red       // 不足以再走一步：红
  const ratio = max > 0 ? value / max : 0
  return ratio > 0.5 ? T.cyan : ratio > 0.25 ? '#26c6da' : T.yellow      // 充足 cyan → 偏低 teal → 告急黄
}

export function StaminaBar({ value, max, h = 6, nextCost }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))
  const color = staminaColor(value, max, nextCost)
  return (
    <div style={{ height: h, background: T.bg0, borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          boxShadow: `0 0 6px ${color}80`,
          transition: 'width .4s, background .3s',
          borderRadius: 3,
        }}
      />
    </div>
  )
}

export function BuffTag({ buffDef, remaining }) {
  if (!buffDef) return null
  const color = buffDef.is_debuff ? T.red : T.green
  return (
    <div
      title={`${buffDef.name}（剩余 ${remaining} 回合）`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 7px',
        borderRadius: 8,
        fontSize: 10,
        background: `${color}15`,
        border: `1px solid ${color}30`,
        color,
      }}
    >
      {buffDef.icon} {buffDef.name}
      <span style={{ opacity: 0.6 }}>{remaining}</span>
    </div>
  )
}

export function LogLine({ entry }) {
  const color = {
    damage: T.red,
    heal: T.green,
    crit: T.yellow,
    buff: T.purple,
    system: T.cyan,
    death: T.red,
    kill: T.yellow,
    attack: T.orange,
  }[entry.type] || T.dimB

  return (
    <div style={{ padding: '4px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12, color, lineHeight: 1.5 }}>
      <span style={{ color: T.dim, marginRight: 6, fontFamily: 'monospace', fontSize: 10 }}>{entry.time}</span>
      {entry.text}
    </div>
  )
}

export function PanelTitle({ children, right }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        fontSize: 11,
        fontWeight: 700,
        color: T.dimB,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        flexShrink: 0,
      }}
    >
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  )
}

export function Btn({ children, variant = 'default', size = 'md', onClick, disabled, loading, loadingText, sx = {} }) {
  const sizes = {
    sm: { fontSize: 11, padding: '4px 10px' },
    md: { fontSize: 13, padding: '8px 16px' },
    lg: { fontSize: 15, padding: '12px 24px' },
  }
  const variants = {
    default: { background: T.bg3, color: T.text, border: `1px solid ${T.border}` },
    primary: { background: T.cyan, color: T.bg0 },
    danger: { background: `${T.red}20`, color: T.red, border: `1px solid ${T.red}40` },
    warn: { background: `${T.yellow}18`, color: T.yellow, border: `1px solid ${T.yellow}30` },
    ghost: { background: 'transparent', color: T.dimB, border: `1px solid ${T.border}` },
  }
  const isDisabled = disabled || loading
  const barColor = variant === 'primary' ? T.bg0 : variant === 'danger' ? T.red : T.cyan
  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className="hov"
      style={{
        border: 'none',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        borderRadius: 6,
        fontWeight: 600,
        fontFamily: 'inherit',
        opacity: isDisabled && !loading ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        transition: 'filter .15s, opacity .15s',
        position: 'relative',
        overflow: 'hidden',
        ...sizes[size],
        ...variants[variant],
        ...sx,
      }}
    >
      {/* 一次性进度填充：从左推到右覆盖整个按钮，模拟动作进度 */}
      {loading && (
        <div
          className="btn-loading-fill"
          style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(90deg, ${barColor}55 0%, ${barColor}30 100%)`,
            transformOrigin: 'left center',
            pointerEvents: 'none',
          }}
        />
      )}
      <span style={{ position: 'relative', zIndex: 1 }}>
        {loading ? (loadingText || children) : children}
      </span>
    </button>
  )
}

export { Modal }

// ════════════════════════════════════════════════════════════════════════
// Phase 30 — 虚拟空间·时间跳跃 BR：100 房网格 + 大时钟（从 /br/[matchId] 移植）
//   纯展示组件 + 纯函数，全部接受派生好的 props（与 HpBar/Btn 同款无副作用风格）。
//   GameClientPage 负责从 rooms.gamevars.br + started_at 派生 brClock/brGrid/myRoom/movable，
//   再 useEffect 起 1s 本地时钟 tick；本文件不持有 state。
//   /br/[matchId]/page.js 走独立 br_match* 路径，沿用其自有内联实现，本组件供 /game 路径用。
// ════════════════════════════════════════════════════════════════════════

// 网格尺寸默认值（仅 fallback：网格宽高现由 gamevars.br.gridW/gridH 快照驱动·见 §4）。
//   旧 100 房局（快照无 gridW/gridH）回退到 10×10 → 与历史写死值相等、零回归。
//   保留旧名 BR_GRID_W/BR_GRID_H 作别名，避免外部 import 断裂（grep 确认本文件内自用为主）。
export const BR_GRID_W_DEFAULT = 10
export const BR_GRID_H_DEFAULT = 10
export const BR_GRID_W = BR_GRID_W_DEFAULT
export const BR_GRID_H = BR_GRID_H_DEFAULT

// ── 大时钟本地推算（clock.js 同款公式，应用层计算不落库）──────────────────
// 入参：{ startedAtMs, phaseSeconds, maxPhase, status }（status: 'active'|'ended'|'lobby'）。
// status!=='active' 或 startedAtMs 为 null ⇒ realPhase=0，无倒计时锚点。
//   realPhase     = min(maxPhase, floor((now - started) / (phaseSeconds*1000)))
//   phaseEndsAtMs = started + (realPhase+1)*phaseSeconds*1000
//   secondsToNext = ceil((phaseEndsAtMs - now) / 1000)
export function computeLocalClock(clockInput, nowMs) {
  const phaseSeconds = clockInput?.phaseSeconds || 0
  const maxPhase = clockInput?.maxPhase ?? 4
  const startedAtMs = clockInput?.startedAtMs ?? null
  const active = clockInput?.status === 'active' && startedAtMs != null

  if (!active || phaseSeconds <= 0) {
    return {
      realPhase: 0,
      maxPhase,
      phaseEndsAtMs: null,
      secondsToNextPhase: null,
      elapsedSeconds: null,
      isEnded: clockInput?.status === 'ended',
    }
  }

  const elapsedMs = Math.max(0, nowMs - startedAtMs)
  const rawPhase = Math.floor(elapsedMs / (phaseSeconds * 1000))
  const realPhase = Math.min(maxPhase, rawPhase)
  const isEnded = realPhase >= maxPhase
  const phaseEndsAtMs = isEnded ? null : startedAtMs + (realPhase + 1) * phaseSeconds * 1000
  const secondsToNextPhase = phaseEndsAtMs != null ? Math.max(0, Math.ceil((phaseEndsAtMs - nowMs) / 1000)) : null

  return {
    realPhase,
    maxPhase,
    phaseEndsAtMs,
    secondsToNextPhase,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    isEnded,
  }
}

// ── 有效阶段（玩家视角的「时间层」）= min(maxPhase, realPhase + depth) ──────────
//   server/br/clock.js effectivePhase 的客户端镜像（同款纯函数，避免从 server 路径 import）。
//   depth 由「时序跃迁」抬高：depth=0 的书写者 effPhase===realPhase（看真实世界层），
//   跃迁者 depth>0 看更深一层（更多禁区 + 更高物资档），封顶 maxPhase。
//   被 GameClientPage 用来给网格着色 / 物资档 / 赌命预判喂「我读哪一层」。
export function effectivePhase(realPhase, depth = 0, maxPhase = 4) {
  const rp = Number.isFinite(realPhase) ? Math.max(0, Math.floor(realPhase)) : 0
  const d = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0
  const mp = Number.isFinite(maxPhase) ? Math.max(0, Math.floor(maxPhase)) : 4
  return Math.min(mp, rp + d)
}

export function fmtBrCountdown(secs) {
  if (secs == null) return '--:--'
  const s = Math.max(0, secs)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

// 预警窗口：缩圈前若干秒把"下阶段将收缩"的扇区标黄。
// 规则书"缩圈前 3 分钟"：满阶段(900s)→180s；短 dev 局按 25% 比例缩放、下限 5s。
export function warnWindowSeconds(phaseSeconds) {
  const ps = Number.isFinite(phaseSeconds) && phaseSeconds > 0 ? phaseSeconds : 900
  return Math.min(180, Math.max(5, Math.round(ps * 0.25)))
}

// 扇区显示态（本地时钟瞬时推算，不等服务端推送 → 即时变红 + 预警黄）：
//   forbidden = 已收缩（realPhase >= closePhase）
//   warning   = 下一阶段将收缩（closePhase === realPhase+1）且已进入预警窗口
//   open      = 其余
export function cellStateFor(room, realPhase, secondsToNext, warnSecs) {
  if (!room) return 'open'
  const cp = Number.isFinite(room.closePhase) ? room.closePhase : 5
  if (realPhase >= cp) return 'forbidden'
  if (cp === realPhase + 1 && secondsToNext != null && secondsToNext <= warnSecs) return 'warning'
  return 'open'
}

// 物资档位 T1..T5 着色（仅展示）
export function lootTierColor(tier) {
  return (
    {
      1: T.dimB,
      2: T.green,
      3: T.cyan,
      4: T.purple,
      5: T.orange,
    }[tier] || T.dim
  )
}

// ── 单个扇区格子（显示态由本地时钟驱动：open / warning / forbidden）──────────
//   isMine     → 我所在格：实线 cyan + 高亮
//   movable    → 相邻且开放：虚线 cyan 边 + 箭头，点击 onMove(roomId) 触发移动
//   hasPlayers → 该格有玩家：右上角圆点
export function BrZoneCell({ room, cellState = 'open', isMine, hasPlayers, movable = false, onMove }) {
  const forbidden = cellState === 'forbidden'
  const warning = cellState === 'warning'
  const accent = forbidden ? T.red : warning ? T.yellow : movable ? T.cyan : T.green
  const tierColor = forbidden ? `${T.red}cc` : warning ? T.yellow : lootTierColor(room?.lootTier)
  const stateLabel = forbidden ? '禁区' : warning ? '预警 · 下阶段收缩' : `开放 · 物资档 T${room?.lootTier ?? '-'}`
  const moveLine = movable ? '\n（点击移动到此扇区）' : ''
  const tip = room
    ? `${room.label || `#${room.roomId}`}（${room.region || ''}）\n${stateLabel}\n收缩于阶段 ${room.closePhase}${moveLine}`
    : ''

  return (
    <div
      title={tip}
      onClick={movable && onMove && room ? () => onMove(room.roomId) : undefined}
      role={movable ? 'button' : undefined}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 4,
        background: forbidden ? `${T.red}10` : warning ? `${T.yellow}1c` : `${T.green}14`,
        border: isMine
          ? `2px solid ${T.cyan}`
          : movable
            ? `1px dashed ${T.cyan}aa`
            : `1px solid ${accent}${warning ? '66' : '40'}`,
        boxShadow: isMine
          ? `0 0 8px ${T.cyan}80`
          : movable ? `0 0 5px ${T.cyan}44` : warning ? `0 0 6px ${T.yellow}55` : 'none',
        animation: warning && !isMine ? 'brPulse 1.2s ease-in-out infinite' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        color: tierColor,
        cursor: movable ? 'pointer' : 'default',
        transition: 'background .25s, border-color .25s, box-shadow .25s',
        overflow: 'hidden',
      }}
    >
      {/* 主标：禁区✕ / 预警⚠ / 否则 T 档 */}
      {forbidden ? (
        <span style={{ opacity: 0.65, fontSize: 11, lineHeight: 1 }}>✕</span>
      ) : (
        <span style={{ fontWeight: 700, lineHeight: 1 }}>
          {warning ? '⚠' : `T${room?.lootTier ?? '-'}`}
        </span>
      )}

      {/* movable 小箭头：右下角，提示可移入 */}
      {movable && !isMine && (
        <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 8, color: `${T.cyan}cc`, lineHeight: 1 }}>➜</span>
      )}

      {/* 该格有玩家：右上角圆点；我所在格 cyan，他人 dimB */}
      {hasPlayers && (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 3,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: isMine ? T.cyan : T.dimB,
            boxShadow: isMine ? `0 0 4px ${T.cyan}` : 'none',
          }}
        />
      )}
    </div>
  )
}

// ── 统计小卡（大时钟 HUD 用）─────────────────────────────────────────────
export function BrStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 48 }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: color || T.text,
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: T.dim, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
    </div>
  )
}

// ── 大时钟 HUD：当前阶段 N/maxPhase + 收缩倒计时 + 末路提示 + 扇区/存活计数 ──
//   全部接受派生好的标量（GameClientPage 用 computeLocalClock + brGrid 算）。
export function BrClockHud({
  realPhase,
  maxPhase,
  secondsToNextPhase,
  status,
  isFinalPhase,
  warnSecs,
  openCount,
  warningCount,
  forbiddenCount,
  aliveCount,
  playerCount,
}) {
  const inWarn = (secondsToNextPhase ?? 999) <= warnSecs
  return (
    <div
      style={{
        background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
        border: `1px solid ${isFinalPhase ? `${T.red}55` : T.borderB}`,
        borderRadius: 12,
        padding: '14px 18px',
        boxShadow: isFinalPhase ? `0 0 24px ${T.red}22` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        {/* 当前阶段 N/maxPhase */}
        <div>
          <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
            收缩阶段
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontSize: 44,
                fontWeight: 800,
                lineHeight: 1,
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                color: isFinalPhase ? T.red : T.cyan,
                textShadow: `0 0 18px ${isFinalPhase ? T.red : T.cyan}55`,
              }}
            >
              {realPhase}
            </span>
            <span style={{ fontSize: 20, color: T.dim, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              / {maxPhase}
            </span>
          </div>
        </div>

        {/* 倒计时 / 末路提示 */}
        <div style={{ textAlign: 'center', flex: 1, minWidth: 180 }}>
          {status !== 'active' ? (
            <div style={{ fontSize: 13, color: T.dimB }}>
              {status === 'ended' ? '对局已结束' : '等待大时钟启动…'}
            </div>
          ) : isFinalPhase ? (
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: T.red,
                  letterSpacing: '2px',
                  textShadow: `0 0 16px ${T.red}66`,
                  animation: 'brPulse 1.4s ease-in-out infinite',
                }}
              >
                末路阶段
              </div>
              <div style={{ fontSize: 11, color: `${T.red}cc`, marginTop: 4 }}>
                收缩边界已达最终态 · 仅余 {openCount} 个开放扇区
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                距下次收缩
              </div>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  lineHeight: 1,
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  color: inWarn ? T.yellow : T.text,
                  textShadow: inWarn ? `0 0 14px ${T.yellow}44` : 'none',
                }}
              >
                {fmtBrCountdown(secondsToNextPhase)}
              </div>
              {inWarn && (
                <div style={{ fontSize: 11, color: T.yellow, marginTop: 4 }}>
                  ⚠ 收缩警报 · {warningCount} 个扇区即将收缩（推进至阶段 {Math.min(maxPhase, realPhase + 1)}）
                </div>
              )}
            </div>
          )}
        </div>

        {/* 扇区/玩家计数 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <BrStat label="开放" value={openCount} color={T.green} />
          {warningCount > 0 && <BrStat label="预警" value={warningCount} color={T.yellow} />}
          <BrStat label="禁区" value={forbiddenCount} color={T.red} />
          <div style={{ width: 1, height: 32, background: T.border }} />
          <BrStat label="存活" value={aliveCount} color={T.cyan} />
          <BrStat label="玩家" value={playerCount} color={T.text} />
        </div>
      </div>
    </div>
  )
}

// ── 房间网格面板：渲染扇区格 + 图例（尺寸由 gridW/gridH props 驱动·见 §4）────────
//   cellByXY: Map<"x,y", room>；room 字段 { roomId, label, region, gridX, gridY, closePhase, lootTier }
//   computeCellState(room) → 'open'|'warning'|'forbidden'（父组件注入本地时钟态）
//   movableRoomIds: Set<roomId>；roomHasPlayer: Set<roomId>；myRoomId: number|null
//   gridW/gridH: 网格宽高（来自 gamevars.br 快照，在飞局冻结）；缺省回退 10×10（旧 100 房零回归）。
export function BrGridPanel({ cellByXY, realPhase, computeCellState, movableRoomIds, roomHasPlayer, myRoomId, onMove, gridW = BR_GRID_W_DEFAULT, gridH = BR_GRID_H_DEFAULT }) {
  // 守卫：非有限 / <1 ⇒ 回退默认，杜绝 repeat(0,1fr) 或 NaN 把网格画崩。
  const cols = Number.isFinite(gridW) && gridW >= 1 ? Math.floor(gridW) : BR_GRID_W_DEFAULT
  const rows = Number.isFinite(gridH) && gridH >= 1 ? Math.floor(gridH) : BR_GRID_H_DEFAULT
  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <PanelTitle right={<span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>阶段 {realPhase} 禁区图</span>}>
        🛰 扇区网格 {cols}×{rows}
      </PanelTitle>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3 }}>
          {Array.from({ length: rows }).map((_, y) =>
            Array.from({ length: cols }).map((_, x) => {
              const room = cellByXY.get(`${x},${y}`)
              const isMine = room != null && room.roomId === myRoomId
              const hasPlayers = room != null && roomHasPlayer.has(room.roomId)
              const cellState = computeCellState(room)
              const movable = room != null && movableRoomIds.has(room.roomId)
              return (
                <BrZoneCell
                  key={`${x},${y}`}
                  room={room}
                  cellState={cellState}
                  isMine={isMine}
                  hasPlayers={hasPlayers}
                  movable={movable}
                  onMove={onMove}
                />
              )
            }),
          )}
        </div>
        {/* 图例 */}
        <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: 10, color: T.dim }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: `${T.green}20`, border: `1px solid ${T.green}40` }} /> 开放（标 T 档）
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: `${T.yellow}1c`, border: `1px solid ${T.yellow}66` }} /> 预警（下阶段收缩）
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: `${T.red}14`, border: `1px solid ${T.red}40` }} /> 禁区
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, border: `2px solid ${T.cyan}` }} /> 我的扇区
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, border: `1px dashed ${T.cyan}aa` }} /> 可移动（相邻）
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.dimB }} /> 有玩家
          </span>
        </div>
      </div>
    </div>
  )
}

