'use client'

/**
 * Phase 27 — PortraitSelectorModal
 *
 * 立绘选择 + 上传 modal。
 *  - 网格展示所有 approved 立绘 + 自己的 pending(灰色 + "审核中")
 *  - 点击 approved → 立即选中,关闭 modal
 *  - "📤 上传新立绘" 按钮 → 文件选择 + supabase.storage.upload → POST /api/portraits record_upload
 *  - "✗ 撤回" 自己的 pending
 *
 * Props:
 *   open
 *   onClose()
 *   onSelected(portraitId, imageUrl) - 选择某个 approved 立绘后回调,父组件更新本地预览
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getGameApi, postGameApi } from '@/lib/gameApi'
import { useAuth } from '@/app/_shell/RootShell'

const C = {
  bg0: '#07090f', bg1: '#0c1018', bg2: '#111827', bg3: '#1a2335',
  border: '#1f2d42', borderB: '#2a3f5f',
  text: '#d4e4f7', dim: '#4a6a8a', dimB: '#6a8aaa',
  cyan: '#00d4ff', green: '#00e676', red: '#ff4455', yellow: '#ffc740', purple: '#b47dff',
}

export default function PortraitSelectorModal({ open, onClose, onSelected }) {
  const { user } = useAuth()
  const [portraits, setPortraits] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    if (!open || !user?.id) return
    let cancelled = false
    setLoading(true); setError('')
    getGameApi('/api/portraits')
      .then(res => {
        if (cancelled) return
        setPortraits(res.portraits || [])
        setSelectedId(res.selectedId || null)
      })
      .catch(e => { if (!cancelled) setError(e?.message || '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, user?.id])

  async function handleSelect(p) {
    if (p.status !== 'approved') return
    try {
      await postGameApi('/api/portraits', { action: 'select', portraitId: p.id })
      setSelectedId(p.id)
      onSelected?.(p.id, p.image_url)
      onClose?.()
    } catch (e) {
      setError(e?.message || '选择失败')
    }
  }

  async function handleClearSelection() {
    try {
      await postGameApi('/api/portraits', { action: 'select', portraitId: null })
      setSelectedId(null)
      onSelected?.(null, null)
      onClose?.()
    } catch (e) {
      setError(e?.message || '清除失败')
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    setError('')

    if (file.size > 5 * 1024 * 1024) {
      setError('文件超过 5MB 限制'); return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('仅支持 PNG / JPEG / WebP'); return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `user/${user.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('portraits').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })
      if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`)

      const { data: pub } = supabase.storage.from('portraits').getPublicUrl(path)
      const imageUrl = pub?.publicUrl
      if (!imageUrl) throw new Error('无法获取 public URL')

      await postGameApi('/api/portraits', {
        action: 'record_upload',
        name: uploadName?.trim() || file.name,
        imageUrl,
        storagePath: path,
      })

      // 重新拉列表
      const fresh = await getGameApi('/api/portraits')
      setPortraits(fresh.portraits || [])
      setSelectedId(fresh.selectedId || null)
      setUploadName('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(err?.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  async function handleCancelUpload(p) {
    if (!confirm('撤回这张立绘?')) return
    try {
      await postGameApi('/api/portraits', { action: 'cancel_upload', portraitId: p.id })
      const fresh = await getGameApi('/api/portraits')
      setPortraits(fresh.portraits || [])
    } catch (e) {
      setError(e?.message || '撤回失败')
    }
  }

  if (!open) return null

  const approved = portraits.filter(p => p.status === 'approved')
  const myPending = portraits.filter(p => p.status === 'pending' && p.uploader_id === user?.id)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div style={{
        background: C.bg1, borderRadius: 14, border: `1px solid ${C.border}`,
        width: '92%', maxWidth: 840, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>🎴 选择角色立绘</div>
          <button onClick={onClose} style={{
            background: 'rgba(14,17,23,0.5)', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '4px 10px', color: C.dim, cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {error && <div style={{ color: C.red, marginBottom: 12, padding: 10, background: `${C.red}10`, borderRadius: 6 }}>{error}</div>}
          {loading && <div style={{ textAlign: 'center', padding: 30, color: C.dim }}>加载中...</div>}

          {!loading && (
            <>
              {/* 上传新立绘 */}
              <div style={{
                marginBottom: 18, padding: 14, borderRadius: 10,
                background: C.bg2, border: `1px dashed ${C.borderB}`,
              }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 6 }}>📤 上传新立绘</div>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>
                  PNG / JPEG / WebP · 推荐 3:5 (如 240×400 / 480×800) · 上限 5MB · 上传后需管理员审核
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text" placeholder="立绘名称(可选)"
                    value={uploadName}
                    onChange={e => setUploadName(e.target.value)}
                    style={{
                      flex: '1 1 200px', minWidth: 0,
                      padding: '6px 10px', borderRadius: 6,
                      background: C.bg0, color: C.text, border: `1px solid ${C.border}`,
                      fontSize: 12,
                    }}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={handleFileSelect}
                    style={{
                      flex: '0 0 auto',
                      padding: '5px 8px', borderRadius: 6,
                      background: C.bg0, color: C.text, border: `1px solid ${C.border}`,
                      fontSize: 11, cursor: uploading ? 'wait' : 'pointer',
                    }}
                  />
                  {uploading && <span style={{ color: C.cyan, fontSize: 11 }}>上传中…</span>}
                </div>
              </div>

              {/* 自己的 pending */}
              {myPending.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, color: C.yellow, fontWeight: 700, marginBottom: 8 }}>
                    ⏳ 我提交的立绘（待审核 {myPending.length} 张）
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                    {myPending.map(p => (
                      <PortraitCard key={p.id} p={p} pending onCancel={() => handleCancelUpload(p)} />
                    ))}
                  </div>
                </div>
              )}

              {/* approved 列表 */}
              <div style={{ fontSize: 12, color: C.dim, fontWeight: 700, marginBottom: 8 }}>
                可选立绘（{approved.length}）
              </div>
              {approved.length === 0 ? (
                <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>暂无可选立绘</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {approved.map(p => (
                    <PortraitCard
                      key={p.id} p={p}
                      isSelected={p.id === selectedId}
                      onClick={() => handleSelect(p)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${C.border}`, flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button onClick={handleClearSelection} style={{
            background: 'transparent', color: C.dimB, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
          }}>清除选择(不显示立绘)</button>
          <span style={{ fontSize: 11, color: C.dim }}>
            点击预览图选定 · 选定后立即生效
          </span>
        </div>
      </div>
    </div>
  )
}

function PortraitCard({ p, isSelected, pending, onClick, onCancel }) {
  const borderColor = isSelected ? C.cyan : pending ? C.yellow : C.border
  return (
    <div style={{
      position: 'relative',
      aspectRatio: '3 / 5',
      background: C.bg0,
      borderRadius: 8,
      border: `2px solid ${borderColor}`,
      cursor: pending ? 'default' : 'pointer',
      overflow: 'hidden',
      transition: 'all 0.15s',
      boxShadow: isSelected ? `0 0 14px ${C.cyan}50` : 'none',
    }}
      onClick={pending ? undefined : onClick}
      onMouseEnter={e => { if (!pending) e.currentTarget.style.borderColor = C.cyan }}
      onMouseLeave={e => { if (!pending && !isSelected) e.currentTarget.style.borderColor = C.border }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.image_url} alt={p.name}
           style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: pending ? 0.55 : 1 }}
           onError={e => { e.target.style.opacity = 0.2 }} />
      {/* 名字 + 状态 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '6px 8px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        fontSize: 11, color: C.text,
      }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
        {p.kind === 'preset' && <div style={{ fontSize: 9, color: C.cyan, marginTop: 1 }}>预设</div>}
        {p.kind === 'user_upload' && !pending && <div style={{ fontSize: 9, color: C.purple, marginTop: 1 }}>玩家作品</div>}
      </div>
      {pending && (
        <>
          <div style={{
            position: 'absolute', top: 6, left: 6, right: 6,
            padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
            background: C.yellow + '30', color: C.yellow, textAlign: 'center',
          }}>⏳ 审核中</div>
          {onCancel && (
            <button onClick={onCancel} style={{
              position: 'absolute', bottom: 6, right: 6,
              padding: '3px 8px', borderRadius: 4, fontSize: 10,
              background: C.red + '30', color: C.red, border: `1px solid ${C.red}50`,
              cursor: 'pointer',
            }}>撤回</button>
          )}
        </>
      )}
      {isSelected && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
          background: C.cyan + '40', color: C.bg0, textShadow: '0 1px 1px rgba(0,0,0,0.5)',
        }}>✓ 已选</div>
      )}
    </div>
  )
}
