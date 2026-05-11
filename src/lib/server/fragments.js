/**
 * 残片发现与解码系统（Decode Archive）
 * 跨周目持久化的知识碎片管理
 */

/**
 * Phase 20.4: 残片合成解锁
 * 玩家在某个残片上达到 decode_level=3 时调用：扫 fragment_combos 表
 * 找所有以"该残片"为输入 A 或 B 的配方，检查另一边是否也已完全解码 →
 * 若是则自动以 decode_level=0 解锁 C 残片。
 *
 * @param {object} client - supabase admin client
 * @param {string} userId - 玩家 UUID
 * @param {number} triggeredFragmentId - 刚达到 level 3 的残片 ID
 * @returns {Array<{fragmentId, name, comboDescription}>} 本次新解锁的残片清单
 */
export async function evaluateFragmentCombos(client, userId, triggeredFragmentId) {
  if (!triggeredFragmentId) return []
  try {
    // 找以 triggered 残片为 A 或 B 的所有启用配方
    const { data: combos } = await client
      .from('fragment_combos')
      .select('id, fragment_id_a, fragment_id_b, unlocks_fragment, description')
      .eq('enabled', true)
      .or(`fragment_id_a.eq.${triggeredFragmentId},fragment_id_b.eq.${triggeredFragmentId}`)

    if (!combos || combos.length === 0) return []

    // 查玩家所有 level=3 的残片
    const { data: decodedRows } = await client
      .from('player_fragments')
      .select('fragment_id')
      .eq('user_id', userId)
      .eq('decode_level', 3)
    const decoded = new Set((decodedRows || []).map(r => r.fragment_id))

    // 查玩家已发现的所有残片（避免重复解锁）
    const { data: ownedRows } = await client
      .from('player_fragments')
      .select('fragment_id')
      .eq('user_id', userId)
    const owned = new Set((ownedRows || []).map(r => r.fragment_id))

    const unlocked = []
    for (const c of combos) {
      // 已经拥有 C 则跳过（不重复解锁）
      if (owned.has(c.unlocks_fragment)) continue
      // 双方都已完全解码
      if (decoded.has(c.fragment_id_a) && decoded.has(c.fragment_id_b)) {
        // 写入 player_fragments(decode_level=0)
        const { error } = await client
          .from('player_fragments')
          .upsert({
            user_id: userId,
            fragment_id: c.unlocks_fragment,
            decode_level: 0,
            discovered_at: new Date().toISOString(),
            last_decoded: new Date().toISOString(),
            discover_cycle: 0, // 0 表示合成解锁，非搜索
          }, { onConflict: 'user_id,fragment_id' })

        if (!error) {
          owned.add(c.unlocks_fragment) // 避免同一次循环内被多个配方重复解锁
          // 查 C 的名字
          const { data: cMeta } = await client
            .from('fragment_pool')
            .select('id, name')
            .eq('id', c.unlocks_fragment)
            .maybeSingle()
          unlocked.push({
            fragmentId: c.unlocks_fragment,
            name: cMeta?.name || `残片 #${c.unlocks_fragment}`,
            comboDescription: c.description || '',
          })
        }
      }
    }
    return unlocked
  } catch (e) {
    console.warn('[evaluateFragmentCombos] 跳过:', e?.message)
    return []
  }
}

/**
 * 尝试发现残片或推进已知残片的解码度
 *
 * Phase 18.1: 加 chain 参数 — search/combat/extract 三链。chain 直接过滤
 * fragment_pool.phase_chain，让搜索/击杀/撤离三个动作分别抽对应链的残片。
 *
 * @param {object} client - supabase admin client
 * @param {string} userId - 玩家 UUID
 * @param {number} mapId - 当前地图 ID
 * @param {number} pollution - 当前有效污染度（0-100）
 * @param {number} gamenum - 当前周目编号
 * @param {object} opts - { chain: 'search' | 'combat' | 'extract' }，默认 'search'
 * @returns {object|null} { fragment_id, decode_level, isNew, chain } 或 null（无可发现残片）
 */
export async function discoverFragment(client, userId, mapId, pollution, gamenum, opts = {}) {
  const chain = opts.chain || 'search'

  // 1. 查询玩家已发现的残片 ID 列表
  const { data: owned } = await client
    .from('player_fragments')
    .select('fragment_id, decode_level')
    .eq('user_id', userId)

  const ownedMap = new Map((owned || []).map(f => [f.fragment_id, f.decode_level]))
  const ownedIds = [...ownedMap.keys()]

  // 2. 查询候选残片池（启用 + 满足污染度 + 匹配 chain + 适用当前地图）
  let query = client
    .from('fragment_pool')
    .select('id, name, category, rarity, discover_mode, phase_chain, maps, min_pollution, requires_fragment_id, weight')
    .eq('enabled', true)
    .lte('min_pollution', Math.floor(pollution))
    .in('discover_mode', ['search', 'both'])
    .eq('phase_chain', chain)

  const { data: candidates } = await query
  if (!candidates || candidates.length === 0) return null

  // 3. 过滤：地图限制 + 前置残片要求
  const eligible = candidates.filter(frag => {
    // 地图限制：空数组 = 所有地图可出现
    if (frag.maps && frag.maps.length > 0 && !frag.maps.includes(mapId)) return false
    // 前置残片：需要玩家已发现指定残片
    if (frag.requires_fragment_id && !ownedIds.includes(frag.requires_fragment_id)) return false
    return true
  })

  if (eligible.length === 0) return null

  // 4. 分流：未发现的新残片 vs 已发现但未完全解码的残片
  const undiscovered = eligible.filter(f => !ownedMap.has(f.id))
  const decodable = eligible.filter(f => ownedMap.has(f.id) && ownedMap.get(f.id) < 3)

  // 70% 概率优先发现新残片，30% 推进已知残片解码
  const preferNew = Math.random() < 0.7

  let target = null
  let isNew = false

  if (preferNew && undiscovered.length > 0) {
    target = weightedPick(undiscovered)
    isNew = true
  } else if (decodable.length > 0) {
    target = weightedPick(decodable)
    isNew = false
  } else if (undiscovered.length > 0) {
    target = weightedPick(undiscovered)
    isNew = true
  } else {
    // 所有残片都已发现且完全解码
    return null
  }

  // 5. 写入数据库
  if (isNew) {
    const { error } = await client
      .from('player_fragments')
      .upsert({
        user_id: userId,
        fragment_id: target.id,
        decode_level: 0,
        discovered_at: new Date().toISOString(),
        last_decoded: new Date().toISOString(),
        discover_cycle: gamenum,
      }, { onConflict: 'user_id,fragment_id' })

    if (error) throw error
    return { fragment_id: target.id, decode_level: 0, isNew: true, chain, name: target.name }
  } else {
    const currentLevel = ownedMap.get(target.id)
    const newLevel = Math.min(3, currentLevel + 1)

    const { error } = await client
      .from('player_fragments')
      .update({
        decode_level: newLevel,
        last_decoded: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('fragment_id', target.id)

    if (error) throw error

    // Phase 20.4: 解码达到 level 3 时，检查 fragment_combos 是否触发解锁
    let comboUnlocks = []
    if (newLevel === 3 && currentLevel < 3) {
      comboUnlocks = await evaluateFragmentCombos(client, userId, target.id)
    }

    return {
      fragment_id: target.id,
      decode_level: newLevel,
      isNew: false,
      chain,
      name: target.name,
      comboUnlocks, // [{ fragmentId, name, comboDescription }]
    }
  }
}

/**
 * 按权重随机选取一个残片
 */
function weightedPick(fragments) {
  const totalWeight = fragments.reduce((sum, f) => sum + (f.weight || 1), 0)
  let remain = Math.random() * totalWeight
  for (const frag of fragments) {
    remain -= frag.weight || 1
    if (remain <= 0) return frag
  }
  return fragments[fragments.length - 1]
}
