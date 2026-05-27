/**
 * Phase 27 — 角色立绘 helper
 *
 * 流程：
 *   1. preset 立绘：admin 在 PortraitsTab 添加 (status='approved')
 *   2. 玩家上传：客户端走 supabase.storage.from('portraits').upload(...) → INSERT portraits 行(pending)
 *   3. admin 审核：approveByAdmin / rejectByAdmin
 *   4. 玩家选立绘：selectPortrait → 更新 profiles.selected_portrait_id
 *   5. joinRoom 注入：player.portraitUrl = portraits.image_url
 */

const APPROVED_STATUS = 'approved'

/**
 * 拉所有 approved 立绘 + 当前玩家自己的 pending（让用户能看到自己上传等审核的）
 */
export async function listVisiblePortraits(client, userId) {
  if (!userId) return []
  const { data } = await client
    .from('portraits')
    .select('id, name, image_url, kind, status, created_at, uploader_id')
    .eq('enabled', true)
    .or(`status.eq.${APPROVED_STATUS},uploader_id.eq.${userId}`)
    .order('status', { ascending: true })  // approved 先,pending 后
    .order('kind', { ascending: true })     // preset 先
    .order('id', { ascending: true })
  return data || []
}

/** Admin: 拉所有待审核的立绘 */
export async function listPendingPortraits(client) {
  const { data } = await client
    .from('portraits')
    .select('id, name, image_url, kind, uploader_id, created_at, storage_path')
    .eq('status', 'pending')
    .eq('enabled', true)
    .order('created_at', { ascending: true })
  return data || []
}

/** Admin: 拉全表(任何 status) */
export async function listAllPortraits(client) {
  const { data } = await client
    .from('portraits')
    .select('*')
    .order('status', { ascending: true })
    .order('id', { ascending: true })
  return data || []
}

/**
 * 玩家上传 — 客户端走 supabase.storage 上传文件后调用本函数写表
 * @param opts { userId, name, imageUrl, storagePath }
 */
export async function recordUserUpload(client, opts) {
  const { userId, name, imageUrl, storagePath } = opts || {}
  if (!userId || !imageUrl) throw new Error('缺少 userId 或 imageUrl')

  const { data, error } = await client
    .from('portraits')
    .insert({
      name: name || '未命名立绘',
      image_url: imageUrl,
      storage_path: storagePath || null,
      kind: 'user_upload',
      uploader_id: userId,
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw new Error(`记录上传失败: ${error.message}`)
  return data
}

/** Admin: 审核通过 */
export async function approveByAdmin(client, portraitId, adminId) {
  const { data, error } = await client
    .from('portraits')
    .update({
      status: 'approved',
      approved_by: adminId,
      approved_at: new Date().toISOString(),
      reject_reason: null,
    })
    .eq('id', portraitId)
    .select()
    .single()
  if (error) throw new Error(`审核失败: ${error.message}`)
  return data
}

/** Admin: 审核拒绝(可选 reason);拒绝后保留行,但 enabled=false 软删 */
export async function rejectByAdmin(client, portraitId, adminId, reason = '') {
  const { data, error } = await client
    .from('portraits')
    .update({
      status: 'rejected',
      approved_by: adminId,
      approved_at: new Date().toISOString(),
      reject_reason: reason || '不符合规范',
    })
    .eq('id', portraitId)
    .select()
    .single()
  if (error) throw new Error(`拒绝失败: ${error.message}`)
  return data
}

/** Admin: 添加 preset 立绘 */
export async function createPreset(client, opts, adminId) {
  const { name, imageUrl, storagePath } = opts || {}
  if (!name || !imageUrl) throw new Error('缺少 name 或 imageUrl')
  const { data, error } = await client
    .from('portraits')
    .insert({
      name,
      image_url: imageUrl,
      storage_path: storagePath || null,
      kind: 'preset',
      uploader_id: null,
      status: 'approved',
      approved_by: adminId,
      approved_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw new Error(`预设创建失败: ${error.message}`)
  return data
}

/** Admin: 软删(enabled=false);不影响已选用的玩家(用 ON DELETE SET NULL) */
export async function disablePortrait(client, portraitId) {
  await client.from('portraits').update({ enabled: false }).eq('id', portraitId)
}

/**
 * 玩家选立绘:仅在 portraits.status=approved 且 enabled=true 时允许
 */
export async function selectPortrait(client, userId, portraitId) {
  if (!userId) throw new Error('未登录')
  if (portraitId == null) {
    // 清空选择
    await client.from('profiles').update({ selected_portrait_id: null }).eq('id', userId)
    return { selected_portrait_id: null }
  }
  // 验证 portrait 状态
  const { data: p } = await client
    .from('portraits')
    .select('id, status, enabled')
    .eq('id', portraitId)
    .maybeSingle()
  if (!p) throw new Error('立绘不存在')
  if (p.status !== 'approved') throw new Error('该立绘未通过审核,不能选择')
  if (!p.enabled) throw new Error('该立绘已下架')

  await client.from('profiles').update({ selected_portrait_id: portraitId }).eq('id', userId)
  return { selected_portrait_id: portraitId }
}

/**
 * 给 joinRoom 调用 — 读玩家的 selected_portrait_id 解析成 image_url
 * @returns {string|null} 立绘 URL 或 null
 */
export async function resolvePortraitUrl(client, userId) {
  if (!userId) return null
  try {
    const { data } = await client
      .from('profiles')
      .select('selected_portrait_id, portraits(image_url, status, enabled)')
      .eq('id', userId)
      .maybeSingle()
    const p = data?.portraits
    if (!p || p.status !== 'approved' || !p.enabled) return null
    return p.image_url || null
  } catch (e) {
    console.warn('[resolvePortraitUrl]', e?.message)
    return null
  }
}
