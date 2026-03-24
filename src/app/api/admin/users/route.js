import { NextResponse } from 'next/server'
import {
  KNOWN_PERMISSION_GROUPS,
  PRIMARY_ADMIN_EMAIL,
  isAdmin,
  normalizeGroups,
} from '@/lib/auth'
import { requireRequestUser } from '@/lib/serverSupabase'

const PAGE_SIZE = 200
const MAX_PAGES = 20
const GROUP_NAME_PATTERN = /^[a-z0-9_-]{1,24}$/

async function listAllUsers(client) {
  const users = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) {
      throw new Error(error.message || '获取用户列表失败')
    }

    const pageUsers = data?.users || []
    users.push(...pageUsers)

    if (pageUsers.length < PAGE_SIZE) {
      break
    }
  }

  return users
}

async function fetchProfiles(client, ids) {
  if (!ids.length) return new Map()

  const { data, error } = await client
    .from('profiles')
    .select('id,roomid')
    .in('id', ids)

  if (error) {
    throw new Error(error.message || '获取用户档案失败')
  }

  return new Map((data || []).map(profile => [profile.id, profile]))
}

function serializeUser(user, profile) {
  const metadata = user.user_metadata || {}
  const username = metadata.username || profile?.username || user.email?.split('@')[0] || user.id

  return {
    id: user.id,
    email: user.email || '',
    username,
    groups: normalizeGroups(metadata.groups || [], { email: user.email }),
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    emailConfirmedAt: user.email_confirmed_at || null,
    roomId: profile?.roomid ?? null,
    isPrimaryAdmin: user.email === PRIMARY_ADMIN_EMAIL,
  }
}

function validateGroups(inputGroups) {
  if (!Array.isArray(inputGroups)) {
    throw new Error('权限组格式不正确')
  }

  const sanitized = inputGroups
    .map(group => String(group || '').trim().toLowerCase())
    .filter(Boolean)

  if (sanitized.some(group => !GROUP_NAME_PATTERN.test(group))) {
    throw new Error('权限组只能包含小写字母、数字、下划线和短横线')
  }

  return sanitized
}

export async function GET(request) {
  const auth = await requireRequestUser(request, { admin: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  try {
    const users = await listAllUsers(auth.supabase)
    const profileMap = await fetchProfiles(auth.supabase, users.map(user => user.id))
    const payload = users
      .map(user => serializeUser(user, profileMap.get(user.id)))
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
        return rightTime - leftTime
      })

    return NextResponse.json({ users: payload, groupOptions: KNOWN_PERMISSION_GROUPS })
  } catch (error) {
    return NextResponse.json({ error: error.message || '获取用户列表失败' }, { status: 500 })
  }
}

export async function PATCH(request) {
  const auth = await requireRequestUser(request, { admin: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  const payload = await request.json().catch(() => ({}))
  const userId = String(payload.id || '').trim()

  if (!userId) {
    return NextResponse.json({ error: '缺少用户 ID' }, { status: 400 })
  }

  try {
    const inputGroups = validateGroups(payload.groups)
    const { data: targetData, error: getUserError } = await auth.supabase.auth.admin.getUserById(userId)

    if (getUserError || !targetData?.user) {
      return NextResponse.json({ error: getUserError?.message || '用户不存在' }, { status: 404 })
    }

    const targetUser = targetData.user

    const nextGroups = normalizeGroups(inputGroups, { email: targetUser.email })
    if (auth.user.id === userId && isAdmin(auth.user) && !nextGroups.includes('admin')) {
      return NextResponse.json({ error: '不能移除自己的管理员权限' }, { status: 400 })
    }

    const metadata = targetUser.user_metadata || {}
    const { data, error } = await auth.supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...metadata,
        groups: nextGroups,
      },
    })

    if (error || !data?.user) {
      throw new Error(error?.message || '更新用户权限失败')
    }

    const profileMap = await fetchProfiles(auth.supabase, [userId])
    return NextResponse.json({
      user: serializeUser(data.user, profileMap.get(userId)),
      groupOptions: KNOWN_PERMISSION_GROUPS,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || '更新用户权限失败' }, { status: 400 })
  }
}
