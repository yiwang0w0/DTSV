'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Modal } from '../_shared/ui'

/**
 * Phase 27 — 立绘管理
 * - pending 队列:审核 approve/reject
 * - approved 列表:可下架(disable)
 * - preset 添加:直接 approved
 */

const STATUS_META = {
  pending:  { label: '⏳ 待审核', color: '#d29922' },
  approved: { label: '✓ 已通过',   color: '#3fb950' },
  rejected: { label: '✗ 已拒绝',   color: '#f85149' },
}

const KIND_META = {
  preset:      { label: '🎨 预设',   color: '#58a6ff' },
  user_upload: { label: '📤 玩家上传', color: '#bc8cff' },
}

const EMPTY_PRESET = { name: '', imageUrl: '', storagePath: '' }

export default function PortraitsTab({ toast }) {
  const [portraits, setPortraits] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  async function load() {
    setLoading(true)
    try {
      const url = `/api/portraits?mode=admin&list=all`
      const res = await fetch(url, { credentials: 'include' })
      const json = await res.json()
      setPortraits(json.portraits || [])
    } catch (e) {
      toast('加载失败: ' + (e.message || e), 'error')
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const filtered = portraits.filter(p =>
    filter === 'all' ? true : p.status === filter
  )

  async function approveOne(p) {
    try {
      await postGameApi('/api/portraits', { action: 'approve', portraitId: p.id })
      toast('已通过审核', 'success')
      load()
    } catch (e) {
      toast('审核失败: ' + e.message, 'error')
    }
  }

  async function rejectOne() {
    if (!rejectModal) return
    try {
      await postGameApi('/api/portraits', { action: 'reject', portraitId: rejectModal.id, reason: rejectReason })
      toast('已拒绝', 'success')
      setRejectModal(null); setRejectReason('')
      load()
    } catch (e) {
      toast('拒绝失败: ' + e.message, 'error')
    }
  }

  async function disable(p) {
    if (!confirm(`下架「${p.name}」?已选用该立绘的玩家会被清空选择。`)) return
    try {
      await postGameApi('/api/portraits', { action: 'disable', portraitId: p.id })
      toast('已下架', 'success')
      load()
    } catch (e) {
      toast('下架失败: ' + e.message, 'error')
    }
  }

  function openAddPreset() { setEdit({ ...EMPTY_PRESET }); setModal(true) }
  async function savePreset() {
    if (!edit.name?.trim() || !edit.imageUrl?.trim()) {
      toast('请填写名称和图片 URL', 'error'); return
    }
    try {
      await postGameApi('/api/portraits', {
        action: 'create_preset',
        name: edit.name,
        imageUrl: edit.imageUrl,
        storagePath: edit.storagePath || null,
      })
      toast('预设已添加', 'success')
      setModal(false)
      load()
    } catch (e) {
      toast('添加失败: ' + e.message, 'error')
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  const counts = {
    pending:  portraits.filter(p => p.status === 'pending').length,
    approved: portraits.filter(p => p.status === 'approved').length,
    rejected: portraits.filter(p => p.status === 'rejected').length,
    all:      portraits.length,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['pending', 'approved', 'rejected', 'all'].map(t => {
            const meta = STATUS_META[t] || { label: '全部', color: '#8b949e' }
            return (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: filter === t ? meta.color : '#21262d',
                color: filter === t ? '#fff' : '#8b949e',
              }}>
                {t === 'all' ? '全部' : meta.label} ({counts[t] || 0})
              </button>
            )
          })}
        </div>
        <button onClick={openAddPreset} style={BTN('#58a6ff', '#fff')}>+ 添加预设立绘</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
          {filter === 'pending' ? '🎉 没有待审核立绘' : `没有 ${STATUS_META[filter]?.label || '该类型'} 立绘`}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {filtered.map(p => {
            const sm = STATUS_META[p.status] || { label: p.status, color: '#8b949e' }
            const km = KIND_META[p.kind] || { label: p.kind, color: '#8b949e' }
            return (
              <div key={p.id} style={{
                background: '#161b22', borderRadius: 8,
                border: `1px solid ${p.enabled ? '#21262d' : '#f8514930'}`,
                opacity: p.enabled ? 1 : 0.5,
                overflow: 'hidden',
              }}>
                <div style={{
                  aspectRatio: '3 / 5', background: '#0e1117',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                  <div style={{
                    position: 'absolute', top: 6, left: 6,
                    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: `${sm.color}25`, color: sm.color, border: `1px solid ${sm.color}50`,
                  }}>{sm.label}</div>
                  <div style={{
                    position: 'absolute', top: 6, right: 6,
                    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                    background: `${km.color}25`, color: km.color,
                  }}>{km.label}</div>
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#e6edf3', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: '#484f58', marginBottom: 8, fontFamily: 'monospace' }}>
                    #{p.id} {new Date(p.created_at).toLocaleDateString('zh-CN')}
                  </div>
                  {p.reject_reason && (
                    <div style={{ fontSize: 10, color: '#f85149', marginBottom: 6, padding: '4px 6px', background: '#f8514910', borderRadius: 4 }}>
                      拒绝理由: {p.reject_reason}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {p.status === 'pending' && (
                      <>
                        <button onClick={() => approveOne(p)} style={BTN('#3fb95025', '#3fb950', { fontSize: 11, padding: '4px 10px', border: '1px solid #3fb95050' })}>✓ 通过</button>
                        <button onClick={() => setRejectModal(p)} style={BTN('#f8514925', '#f85149', { fontSize: 11, padding: '4px 10px', border: '1px solid #f8514950' })}>✗ 拒绝</button>
                      </>
                    )}
                    {p.status === 'approved' && p.enabled && (
                      <button onClick={() => disable(p)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}>下架</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 拒绝原因 modal */}
      {rejectModal && (
        <Modal open={true} title={`拒绝立绘: ${rejectModal.name}`} onClose={() => { setRejectModal(null); setRejectReason('') }}>
          <div>
            <label style={LABEL}>拒绝原因(玩家可见)</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="如:图片含有不当内容 / 尺寸不符 / 与他人重复"
              style={{ ...INPUT, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => { setRejectModal(null); setRejectReason('') }} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={rejectOne} style={BTN('rgba(248,81,73,0.15)', '#f85149', { border: '1px solid rgba(248,81,73,0.3)' })}>确认拒绝</button>
          </div>
        </Modal>
      )}

      {/* 添加预设 modal */}
      {modal && edit && (
        <Modal open={true} title="添加预设立绘" onClose={() => setModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={LABEL}>立绘名称</label>
              <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={INPUT} placeholder="如:PI-引导者 默认" />
            </div>
            <div>
              <label style={LABEL}>图片 URL</label>
              <input value={edit.imageUrl} onChange={e => setEdit({ ...edit, imageUrl: e.target.value })} style={INPUT}
                     placeholder="https://... (推荐 240×420 比例)" />
            </div>
            <div>
              <label style={LABEL}>Storage 路径(可选,自己 upload 到 storage 后填路径)</label>
              <input value={edit.storagePath || ''} onChange={e => setEdit({ ...edit, storagePath: e.target.value })} style={INPUT}
                     placeholder="留空 = 外链图片" />
            </div>
            {edit.imageUrl && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ aspectRatio: '3 / 5', width: 160, background: '#0e1117', borderRadius: 6, overflow: 'hidden', border: '1px solid #21262d' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={edit.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.opacity = 0.3 }} />
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(false)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={savePreset} style={BTN('#58a6ff', '#fff')}>添加预设</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
