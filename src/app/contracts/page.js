'use client'

/**
 * /contracts — 玩家合同（任务）页
 *
 * 列出 active / completed / available 合同，
 * 可以从 available 状态接受到 active。
 */

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getGameApi, postGameApi } from '@/lib/gameApi'
import { useAuth } from '../layout'
import { Spinner, useToast } from '../admin/_shared/ui'

const C = {
  bg0: '#0e1117', bg1: '#1c2129', bg2: '#161b22',
  border: '#30363d', border2: '#21262d',
  text: '#e6edf3', dim: '#8b949e', dim2: '#484f58',
  accent: '#58a6ff', green: '#3fb950', red: '#f85149', yellow: '#d29922', purple: '#bc8cff',
}

const STATUS_META = {
  available: { label: '可接受', color: C.dim },
  active:    { label: '进行中', color: C.yellow },
  completed: { label: '已完成', color: C.green },
  failed:    { label: '失败',   color: C.red },
}

const OBJECTIVE_TEXT = {
  find_item:   obj => `搜集 ${obj.itemName || '?'} ×${obj.count || 1}`,
  kill_npc:    obj => `击杀 ${obj.npcName || '?'} ×${obj.count || 1}`,
  kill_any:    obj => `击杀任意实体 ×${obj.count || 1}`,
  extract:     obj => `成功撤离 ×${obj.count || 1}`,
  extract_at:  obj => `从【${obj.extractionPointId || '?'}】撤离`,
  purchase:    obj => `出勤准备界面购买装备/物资 ×${obj.count || 1}`,
  leave_probe: obj => `撤离时留下异步探针 ×${obj.count || 1}`,
}

export default function ContractsPage() {
  const { user, loading: authLoading } = useAuth()
  const { show: toast, Container: ToastContainer } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [accepting, setAccepting] = useState(null)

  const reload = async () => {
    try {
      const res = await getGameApi('/api/contracts')
      setItems(res?.contracts || [])
    } catch (err) {
      toast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter(it => it.status === filter)
  }, [items, filter])

  async function accept(contractId) {
    setAccepting(contractId)
    try {
      await postGameApi('/api/contracts', { action: 'accept', contractId })
      toast('已接受合同')
      await reload()
    } catch (err) {
      toast(err.message || '接受失败', 'error')
    } finally {
      setAccepting(null)
    }
  }

  if (authLoading || loading) return <Spinner />

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: C.dim, fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: C.accent }}>登录</Link>
        </p>
      </div>
    )
  }

  const counts = {
    all:       items.length,
    available: items.filter(it => it.status === 'available').length,
    active:    items.filter(it => it.status === 'active').length,
    completed: items.filter(it => it.status === 'completed').length,
  }

  return (
    <div className="animate-in">
      <ToastContainer />

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>📜 合同</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.dim }}>
          完成合同即可获得奖励物品到账户库。在 raid 中达成目标会自动推进进度。
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { k: 'all',       label: '全部' },
          { k: 'active',    label: '进行中' },
          { k: 'available', label: '可接受' },
          { k: 'completed', label: '已完成' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setFilter(t.k)}
            style={{
              padding: '6px 14px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${filter === t.k ? C.accent : C.border}`,
              background: filter === t.k ? `${C.accent}18` : 'transparent',
              color: filter === t.k ? C.accent : C.dim,
            }}
          >
            {t.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>({counts[t.k]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.dim2 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
          <p style={{ margin: 0 }}>没有符合条件的合同</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(it => (
            <ContractCard
              key={it.contract.id}
              entry={it}
              onAccept={() => accept(it.contract.id)}
              accepting={accepting === it.contract.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ContractCard({ entry, onAccept, accepting }) {
  const { contract, progress, status } = entry
  const statusMeta = STATUS_META[status] || STATUS_META.available

  const objectives = Array.isArray(contract.objectives) ? contract.objectives : []
  const rewards = Array.isArray(contract.rewards) ? contract.rewards : []

  return (
    <div style={{
      background: C.bg1, borderRadius: 12,
      border: `1px solid ${status === 'completed' ? `${C.green}40` : C.border}`,
      borderLeft: `3px solid ${statusMeta.color}`,
      padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{contract.name}</span>
        <span style={{
          fontSize: 10, padding: '1px 8px', borderRadius: 12, fontWeight: 700,
          background: `${statusMeta.color}18`, color: statusMeta.color, border: `1px solid ${statusMeta.color}40`,
        }}>{statusMeta.label}</span>
        <div style={{ flex: 1 }} />
        {status === 'available' && (
          <button
            onClick={onAccept}
            disabled={accepting}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: accepting ? 'wait' : 'pointer',
              background: C.accent, color: '#fff', border: 'none', fontWeight: 700,
              opacity: accepting ? 0.6 : 1,
            }}
          >{accepting ? '处理中…' : '接受'}</button>
        )}
      </div>

      {contract.description && (
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>{contract.description}</div>
      )}

      {/* 目标 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>目标</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {objectives.map((obj, i) => {
            const cur = Number(progress?.[i] || 0)
            const max = Number(obj.count || 1)
            const done = cur >= max
            const text = (OBJECTIVE_TEXT[obj.type] || (() => `${obj.type}: ${JSON.stringify(obj)}`))(obj)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 7,
                background: done ? `${C.green}10` : C.bg2,
                border: `1px solid ${done ? `${C.green}40` : C.border}`,
              }}>
                <span style={{ fontSize: 12, color: done ? C.green : C.text, flex: 1 }}>
                  {done ? '✓' : '○'} {text}
                </span>
                <span style={{ fontSize: 11, color: done ? C.green : C.dim, fontFamily: 'monospace' }}>
                  {cur}/{max}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 奖励 */}
      {rewards.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>奖励</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {rewards.map((r, i) => (
              <span key={i} style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11,
                background: `${C.yellow}15`, color: C.yellow, border: `1px solid ${C.yellow}30`,
              }}>{r.name} ×{r.quantity}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
