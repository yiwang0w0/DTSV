/**
 * signalLock.js — 撤离信号锁定窗口（research 2026-05-29-A P0）
 *
 * 把撤离从"安全按钮"改成"N 回合承诺"。玩家点撤离 → 发出撤离信号进入脆弱态，
 * 必须再坚持 SIGNAL_LOCK.WINDOW_TURNS 个回合才真正完成结构退避。锁定期内：
 *   - 环境/个人污染加速 tick（pollution.js: tickEnvPollution + applySignalLockPollution）
 *   - 该玩家遭遇异步探针的概率提升（signalLockProbeEncounterMult，Phase 21 tryEncounterProbe 读取）
 *   - UI 切到"🛰 撤离信号已发出"高张力态（ExtractionModal / GameClientPage）
 *
 * 设计红线（notes-2026-05-29-A 发现 7 / P0）：保留异步优势 —— 脆弱态只放大
 *   PvE / 探针 / 污染压力，绝不召唤同屏真人对手（no synchronous camper）。
 *
 * 纯函数：不写 DB、不改入参，返回新对象。预埋不启用（SIGNAL_LOCK.ENABLED=false），
 *   等 Phase 21/24b 接 extractPlayer 控制流 + 回合 tick 循环 + 倒计时 UI 后翻 true。
 */
import { SIGNAL_LOCK } from '../constants'

/** 玩家是否处于撤离信号锁定脆弱态 */
export function isSignalLockActive(player) {
  const t = player?.signalLock?.turnsLeft
  return Number.isFinite(t) && t > 0
}

/** 发出撤离信号：进入 WINDOW_TURNS 回合脆弱态（记录出口快照以便锁定完成后兑现） */
export function beginSignalLock(player, cfg = SIGNAL_LOCK) {
  if (!player) return player
  const turns = Math.max(1, Math.floor(Number(cfg?.WINDOW_TURNS) || 1))
  return {
    ...player,
    signalLock: {
      turnsLeft: turns,
      totalTurns: turns,
      startedAt: new Date().toISOString(),
      exitMapId: player.map ?? null,
    },
  }
}

/**
 * 每回合 -1。归零返回 ready=true（调用方据此触发真正的 extractPlayer 完成分支）。
 * @returns {{ player, ready:boolean, log?:string }}
 */
export function tickSignalLock(player) {
  if (!isSignalLockActive(player)) return { player, ready: false }
  const next = player.signalLock.turnsLeft - 1
  if (next > 0) {
    return {
      player: { ...player, signalLock: { ...player.signalLock, turnsLeft: next } },
      ready: false,
      log: `${player.name || '玩家'} 的撤离信号仍在锁定（脆弱态剩余 ${next} 回合）`,
    }
  }
  return {
    player: { ...player, signalLock: null },
    ready: true,
    log: `${player.name || '玩家'} 的撤离信号锁定完成 — 结构退避通道开启`,
  }
}

/** 锁定期该玩家遭遇异步探针的概率倍率（Phase 21 tryEncounterProbe 读取；非锁定期为 1） */
export function signalLockProbeEncounterMult(player, cfg = SIGNAL_LOCK) {
  if (!isSignalLockActive(player)) return 1
  const m = Number(cfg?.PROBE_ENCOUNTER_MULT)
  return Number.isFinite(m) && m > 0 ? m : 1
}
