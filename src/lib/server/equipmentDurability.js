/**
 * consumeDurabilityParallel(ownerId, roomId, amount, client) — 扣减玩家在本房已装备件的耐久。
 *
 * 速度（Phase 40）：旧实现 = 1 次 SELECT + 每件 1 次 UPDATE（best-effort）。改为单条 RPC
 *   consume_equipment_durability（一次往返·原子按行 GREATEST(0,dur-amount) + is_equipped=(dur-amount>0)），
 *   把每次战斗动作的 1+N 次查询降为 1 次。逻辑与旧版逐值等价（同 WHERE：owner+room+is_equipped+dur>0）。
 *   见 scripts/phase-40-perf-durability-rpc.sql。函数名保留（向后兼容调用点），已非 parallel-update 实现。
 */
export async function consumeDurabilityParallel(ownerId, roomId, amount = 1, client) {
  if (!client) {
    throw new Error('Missing Supabase client')
  }

  const { error } = await client.rpc('consume_equipment_durability', {
    p_owner: ownerId,
    p_room: roomId,
    p_amount: amount,
  })
  if (error) throw new Error(error.message || 'consume durability failed')
}
