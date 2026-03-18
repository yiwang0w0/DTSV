import { NextResponse } from 'next/server'
import { executeEquipmentAction, withRetry, VersionConflictError } from '@/lib/server/gameActions'
import { requireRequestUser } from '@/lib/serverSupabase'

export async function POST(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  try {
    const payload = await request.json()
    const result = await withRetry(() => executeEquipmentAction(auth.supabase, auth.user, payload))
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ error: '操作冲突，请重试' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message || '装备操作失败' }, { status: 400 })
  }
}
