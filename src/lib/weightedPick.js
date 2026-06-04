/**
 * weightedPick.js — 共享加权随机抽取
 *
 * 把散落在 fragments / events / pathGenerator / probes 各处「reduce 求 total →
 * rng()×total → 累减命中 → 末项兜底」的同构算法收口到一处。**行为逐值等价**：
 *   - 空数组（或非数组）⇒ 返回 null
 *   - 否则 total = Σ weightFn(item)，r = rng() × total，按序累减，r <= 0 即命中
 *   - 浮点误差导致走完循环未命中 ⇒ 兜底返回末项
 *
 * weightFn 默认取 item.weight（与原 fragments 默认 `f.weight || 1` 对齐——这里返回
 *   item.weight，调用方若需 `|| 1` 兜底应在各自闭包里显式处理，见 fragments/events 的传入）。
 * rng 默认原生 Math.random（与各处原实现一致）。注入 rng 仅为可测，不改变默认分布。
 *
 * @template T
 * @param {T[]} items                被抽取候选数组
 * @param {(item: T) => number} [weightFn]  权重函数，默认 item.weight
 * @param {() => number} [rng]       [0,1) 随机源，默认 Math.random
 * @returns {T|null} 命中项；空候选返回 null
 */
export function weightedPick(items, weightFn = (item) => item.weight, rng = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null
  const total = items.reduce((sum, it) => sum + weightFn(it), 0)
  let r = rng() * total
  for (const it of items) {
    r -= weightFn(it)
    if (r <= 0) return it
  }
  return items[items.length - 1]
}
