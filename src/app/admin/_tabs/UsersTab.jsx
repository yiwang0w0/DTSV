'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { KNOWN_PERMISSION_GROUPS } from '@/lib/auth'
import { BTN, INPUT, LABEL, Modal, Spinner } from '../_shared/ui'
import GrantStashModal from '@/components/GrantStashModal'

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token
}

async function requestAdminUsers(method = 'GET', body) {
  const token = await getAccessToken()
  const response = await fetch('/api/admin/users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || '请求失败')
  }

  return payload
}

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildGroupMeta(groupOptions, group) {
  return groupOptions.find(option => option.key === group) || { key: group, label: group, color: '#6e7681' }
}

export default function UsersTab({ toast }) {
  const [users, setUsers] = useState([])
  const [groupOptions, setGroupOptions] = useState(KNOWN_PERMISSION_GROUPS)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [editingUser, setEditingUser] = useState(null)
  const [selectedGroups, setSelectedGroups] = useState([])
  const [customGroups, setCustomGroups] = useState('')
  const [saving, setSaving] = useState(false)
  const [grantTarget, setGrantTarget] = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await requestAdminUsers('GET')
      setUsers(payload.users || [])
      setGroupOptions(payload.groupOptions || KNOWN_PERMISSION_GROUPS)
    } catch (error) {
      toast(error.message || '加载用户失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  function openEdit(user) {
    const presetKeys = new Set(groupOptions.map(option => option.key))
    setEditingUser(user)
    setSelectedGroups((user.groups || []).filter(group => presetKeys.has(group)))
    setCustomGroups((user.groups || []).filter(group => !presetKeys.has(group)).join(', '))
  }

  function closeEdit() {
    setEditingUser(null)
    setSelectedGroups([])
    setCustomGroups('')
    setSaving(false)
  }

  function toggleGroup(groupKey) {
    setSelectedGroups(current => (
      current.includes(groupKey)
        ? current.filter(group => group !== groupKey)
        : [...current, groupKey]
    ))
  }

  async function saveGroups() {
    if (!editingUser) return

    const extraGroups = customGroups
      .split(',')
      .map(group => group.trim().toLowerCase())
      .filter(Boolean)

    setSaving(true)
    try {
      const payload = await requestAdminUsers('PATCH', {
        id: editingUser.id,
        groups: [...selectedGroups, ...extraGroups],
      })

      setUsers(current => current.map(user => (
        user.id === payload.user.id ? payload.user : user
      )))
      setGroupOptions(payload.groupOptions || groupOptions)
      toast(`已更新 ${payload.user.username || payload.user.email} 的权限组`)
      closeEdit()
    } catch (error) {
      toast(error.message || '更新权限失败', 'error')
      setSaving(false)
    }
  }

  const allGroupKeys = Array.from(new Set([
    ...groupOptions.map(option => option.key),
    ...users.flatMap(user => user.groups || []),
  ]))

  const filteredUsers = users.filter(user => {
    const keyword = search.trim().toLowerCase()
    const matchesSearch = !keyword || [
      user.username,
      user.email,
      user.id,
      ...(user.groups || []),
    ].some(value => String(value || '').toLowerCase().includes(keyword))

    const matchesGroup = groupFilter === 'all' || (user.groups || []).includes(groupFilter)
    return matchesSearch && matchesGroup
  })

  const adminCount = users.filter(user => (user.groups || []).includes('admin')).length
  const activeRoomCount = users.filter(user => user.roomId !== null && user.roomId !== undefined).length

  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>用户总数</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#58a6ff', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{users.length}</div>
        </div>
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>管理员</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f85149', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{adminCount}</div>
        </div>
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>房间中用户</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#3fb950', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{activeRoomCount}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', color: '#8b949e', fontSize: 12 }}>
        当前权限系统基于 `auth.users.user_metadata.groups`。现在已实际接入鉴权的是 `admin`；其他组可先用于运营分组和后续权限扩展。
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          <input
            style={{ ...INPUT, width: 260 }}
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="搜索用户名 / 邮箱 / ID / 权限组"
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[{ key: 'all', label: '全部' }, ...allGroupKeys.map(group => {
              const meta = buildGroupMeta(groupOptions, group)
              return { key: group, label: meta.label }
            })].map(item => (
              <button
                key={item.key}
                onClick={() => setGroupFilter(item.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  cursor: 'pointer',
                  border: `1px solid ${groupFilter === item.key ? '#58a6ff' : '#30363d'}`,
                  background: groupFilter === item.key ? 'rgba(88,166,255,0.12)' : 'transparent',
                  color: groupFilter === item.key ? '#58a6ff' : '#8b949e',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={loadUsers} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>刷新</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredUsers.map(user => (
          <div key={user.id} style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>{user.username || '未命名用户'}</span>
                  {user.isPrimaryAdmin && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(248,81,73,0.12)', color: '#f85149', border: '1px solid rgba(248,81,73,0.25)' }}>
                      主管理员
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>{user.email || '-'}</div>
                <div style={{ fontSize: 11, color: '#6e7681', marginBottom: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{user.id}</div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {(user.groups || []).map(group => {
                    const meta = buildGroupMeta(groupOptions, group)
                    return (
                      <span
                        key={group}
                        style={{
                          fontSize: 11,
                          padding: '3px 10px',
                          borderRadius: 999,
                          background: `${meta.color}18`,
                          color: meta.color,
                          border: `1px solid ${meta.color}30`,
                        }}
                      >
                        {meta.label}
                      </span>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#8b949e' }}>
                  <span>注册：{formatTime(user.createdAt)}</span>
                  <span>最近登录：{formatTime(user.lastSignInAt)}</span>
                  <span>房间：{user.roomId ?? '-'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <button
                  onClick={() => setGrantTarget(user)}
                  style={BTN('rgba(63,185,80,0.12)', '#3fb950', { border: '1px solid rgba(63,185,80,0.25)' })}
                  title="发放道具到该用户的账户库"
                >
                  📦 发放道具
                </button>
                <button
                  onClick={() => openEdit(user)}
                  style={BTN('rgba(88,166,255,0.12)', '#58a6ff', { border: '1px solid rgba(88,166,255,0.25)' })}
                >
                  编辑权限组
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredUsers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>没有匹配的用户</div>
        )}
      </div>

      <Modal open={!!editingUser} onClose={closeEdit} title={editingUser ? `编辑权限组：${editingUser.username || editingUser.email}` : '编辑权限组'}>
        {editingUser && (
          <div>
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: '#161b22', border: '1px solid #30363d' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{editingUser.email || '-'}</div>
              <div style={{ fontSize: 11, color: '#8b949e', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{editingUser.id}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={LABEL}>预设权限组</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {groupOptions.map(option => {
                  const selected = selectedGroups.includes(option.key)
                  const locked = option.key === 'user'
                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={locked}
                      onClick={() => toggleGroup(option.key)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        fontSize: 12,
                        cursor: locked ? 'not-allowed' : 'pointer',
                        border: `1px solid ${selected || locked ? option.color : '#30363d'}`,
                        background: selected || locked ? `${option.color}18` : 'transparent',
                        color: selected || locked ? option.color : '#8b949e',
                        opacity: locked ? 0.8 : 1,
                      }}
                    >
                      {option.label}
                      {locked ? '（默认）' : ''}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={LABEL}>自定义权限组</label>
              <input
                style={INPUT}
                value={customGroups}
                onChange={event => setCustomGroups(event.target.value)}
                placeholder="多个分组用英文逗号分隔，例如: analyst, qa"
              />
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>
                仅允许小写字母、数字、下划线和短横线。保存时会自动去重，并始终保留 `user`。
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={closeEdit} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={saveGroups} disabled={saving} style={BTN('#58a6ff', '#fff', { opacity: saving ? 0.7 : 1, cursor: saving ? 'wait' : 'pointer' })}>
                {saving ? '保存中...' : '保存权限组'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <GrantStashModal
        open={!!grantTarget}
        targetUser={grantTarget}
        onClose={(result) => {
          setGrantTarget(null)
          if (result?.granted?.length) {
            const total = result.granted.reduce((s, it) => s + (it.quantity || 0), 0)
            toast(`已发放 ${total} 件道具到 ${grantTarget?.username || grantTarget?.email || '用户'}`)
          }
        }}
      />
    </div>
  )
}
