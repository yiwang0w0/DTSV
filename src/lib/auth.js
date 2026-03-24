// helpers for user groups and permissions
import { supabase } from './supabase'

// 在需要的地方调整为你的唯一管理员邮箱
export const PRIMARY_ADMIN_EMAIL = '2949215486@qq.com'

export const KNOWN_PERMISSION_GROUPS = [
  { key: 'user', label: '基础用户', color: '#8b949e' },
  { key: 'admin', label: '管理员', color: '#f85149' },
  { key: 'gm', label: 'GM', color: '#58a6ff' },
  { key: 'moderator', label: '版务', color: '#d29922' },
  { key: 'editor', label: '编辑', color: '#3fb950' },
]

export function normalizeGroups(groups = [], { email } = {}) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(groups) ? groups : [])
        .map(group => String(group || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  )

  if (!normalized.includes('user')) {
    normalized.unshift('user')
  }
  if (email === PRIMARY_ADMIN_EMAIL && !normalized.includes('admin')) {
    normalized.push('admin')
  }

  return normalized
}

export function getUserGroups(user) {
  return normalizeGroups(user?.user_metadata?.groups || [], { email: user?.email })
}

export function hasGroup(user, group) {
  return getUserGroups(user).includes(group)
}

export function isAdmin(user) {
  if (!user) return false
  if (user.email === PRIMARY_ADMIN_EMAIL) return true
  return hasGroup(user, 'admin')
}

// 确保用户登录时正确记录 metadata，用于第一次注册或后来修改
export async function ensureAdminMetadata(user) {
  if (!user) return
  const existing = user.user_metadata || {}
  const groups = normalizeGroups(existing.groups || [], { email: user.email })
  const existingGroups = Array.isArray(existing.groups) ? existing.groups : []

  if (JSON.stringify(groups) !== JSON.stringify(existingGroups)) {
    await supabase.auth.updateUser({ data: { ...existing, groups } })
  }
}
