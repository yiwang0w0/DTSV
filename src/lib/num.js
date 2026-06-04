/**
 * num.js — 纯数值工具（**零外部 import**）
 *
 * 本文件刻意不 import 任何东西：它可能被以原生 Node ESM 直接加载的纯模块
 * （如 pollution.js / stamina.js，被 scripts 下 .mjs 校验或 smoke-check 直接 import）
 * 复用。Node 不解析 webpack 的 @/ 别名，故此处保持零依赖、相对路径可被任意消费方解析。
 */

/**
 * 把 x 钳制到 [lo, hi]。非有限输入（NaN / Infinity / 非数字）兜底取 lo。
 *
 * 这是「带 finite 兜底」的统一版：原先 stamina.js 用此版，pollution.js 用裸版
 * （`x<lo→lo / x>hi→hi`，无 finite 检查）。正常路径（x 为有限数）两版数值完全一致；
 * 仅在 x 非有限时分叉——统一到本兜底版（更安全），且既有调用点正常数值不变。
 *
 * @param {number} x
 * @param {number} lo
 * @param {number} hi
 * @returns {number} 钳制后的值
 */
export function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo
  if (x < lo) return lo
  if (x > hi) return hi
  return x
}

/**
 * 闭区间 [lo, hi] 内的均匀整数随机。
 * 默认 rng 为原生 Math.random；注入仅为可测，不改变默认分布。
 *
 * @param {number} lo
 * @param {number} hi
 * @param {() => number} [rng]
 * @returns {number} lo..hi（含两端）的整数
 */
export function randInt(lo, hi, rng = Math.random) {
  return Math.floor(rng() * (hi - lo + 1)) + lo
}
