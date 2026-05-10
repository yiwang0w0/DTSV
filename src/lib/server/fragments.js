/**
 * 残片发现与解码系统（Decode Archive）
 * 跨周目持久化的知识碎片管理
 */

/**
 * 搜索时尝试发现残片或推进已知残片的解码度
 * @param {object} client - supabase admin client
 * @param {string} userId - 玩家 UUID
 * @param {number} mapId - 当前地图 ID
 * @param {number} pollution - 当前有效污染度（0-100）
 * @param {number} gamenum - 当前周目编号
 * @returns {object|null} { fragment_id, decode_level, isNew } 或 null（无可发现残片）
 */
export async function discoverFragment(client, userId, mapId, pollution, gamenum) {
  // 1. 查询玩家已发现的残片 ID 列表
  const { data: owned } = await client
    .from('player_fragments')
    .select('fragment_id, decode_level')
    .eq('user_id', userId)

  const ownedMap = new Map((owned || []).map(f => [f.fragment_id, f.decode_level]))
  const ownedIds = [...ownedMap.keys()]

  // 2. 查询候选残片池（启用的、满足污染度要求的、适用当前地图的）
  let query = client
    .from('fragment_pool')
    .select('id, name, category, rarity, discover_mode, maps, min_pollution, requires_fragment_id, weight')
    .eq('enabled', true)
    .lte('min_pollution', Math.floor(pollution))
    .in('discover_mode', ['search', 'both'])

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
    return { fragment_id: target.id, decode_level: 0, isNew: true }
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
    return { fragment_id: target.id, decode_level: newLevel, isNew: false }
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
