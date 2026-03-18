import { NextResponse } from 'next/server'
import { executeEquipmentAction } from '@/lib/server/gameActions'
import { requireRequestUser } from '@/lib/serverSupabase'

export async function POST(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  try {
    const payload = await request.json()
    const result = await executeEquipmentAction(auth.supabase, auth.user, payload)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error.message || '装备操作失败' }, { status: 400 })
  }
}

