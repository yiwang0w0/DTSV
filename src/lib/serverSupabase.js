import { createClient } from '@supabase/supabase-js'
import { isAdmin } from './auth'

function requireEnv(name) {
  const value = process.env[name]
  // 临时调试日志 - 排查后删除
  console.log(`[ENV DEBUG] ${name}: exists=${!!value}, type=${typeof value}, length=${value?.length ?? 'N/A'}`)
  console.log(`[ENV DEBUG] SUPABASE-related keys:`, Object.keys(process.env).filter(k => k.includes('SUPABASE')))
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function createServerSupabase() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}

export async function getRequestUser(request, supabase = createServerSupabase()) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return { user: null, error: '未登录', status: 401 }
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { user: null, error: '身份验证失败', status: 401 }
  }

  return { user, error: null, status: 200 }
}

export async function requireRequestUser(request, { admin = false } = {}) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)

  if (!auth.user) {
    return { ok: false, supabase, response: { error: auth.error, status: auth.status } }
  }

  if (admin && !isAdmin(auth.user)) {
    return { ok: false, supabase, response: { error: '无权限', status: 403 } }
  }

  return { ok: true, supabase, user: auth.user }
}

