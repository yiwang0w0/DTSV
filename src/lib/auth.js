// helpers for user groups and permissions
import { supabase } from './supabase';

// 在需要的地方调整为你的唯一管理员邮箱
export const PRIMARY_ADMIN_EMAIL = '2949215486@qq.com';

export function hasGroup(user, group) {
  return user?.user_metadata?.groups?.includes(group);
}

export function isAdmin(user) {
  if (!user) return false;
  if (user.email === PRIMARY_ADMIN_EMAIL) return true;
  return hasGroup(user, 'admin');
}

// 确保用户登录时正确记录 metadata，用于第一次注册或后来修改
export async function ensureAdminMetadata(user) {
  if (!user) return;
  const existing = user.user_metadata || {};
  const groups = existing.groups || [];
  if (user.email === PRIMARY_ADMIN_EMAIL && !groups.includes('admin')) {
    const newGroups = [...groups, 'admin'];
    await supabase.auth.updateUser({ data: { ...existing, groups: newGroups } });
  }
}
