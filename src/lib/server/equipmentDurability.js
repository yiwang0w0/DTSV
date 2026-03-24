export async function consumeDurabilityParallel(ownerId, roomId, amount = 1, client) {
  if (!client) {
    throw new Error('Missing Supabase client')
  }

  const { data: instances } = await client
    .from('equipment_instances')
    .select('id, durability_current')
    .eq('owner_id', ownerId)
    .eq('room_id', roomId)
    .eq('is_equipped', true)
    .gt('durability_current', 0)

  await Promise.all((instances || []).map(inst => {
    const newDur = Math.max(0, (inst.durability_current ?? 0) - amount)
    return client
      .from('equipment_instances')
      .update({ durability_current: newDur, is_equipped: newDur > 0 })
      .eq('id', inst.id)
  }))
}
