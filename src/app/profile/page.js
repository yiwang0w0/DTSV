'use client'

/**
 * /profile — Phase 28 个人主页
 *
 * 三块:
 *   1. 立绘配置 — 大预览 + "管理立绘"按钮(复用 PortraitSelectorModal)
 *   2. 账户情报 — username / motto / killmsg / lastword / gender 表单
 *   3. 战绩统计 — validgames / wingames / elo / credits / gold (只读)
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/_shell/RootShell'
import { getGameApi, postGameApi } from '@/lib/gameApi'
import { Spinner } from '../admin/_shared/ui'
import PortraitSelectorModal from '@/components/PortraitSelectorModal'
import { THEME } from '@/lib/theme'

// 本地调色板：键名保留（所有消费点不变），值改为引用全站统一 THEME（GitHub-dark 单一真源）。
//   换肤只需改 src/lib/theme.js 一处。
const C = {
  bg0: THEME.bg, bg1: THEME.panel2, bg2: THEME.panel, border: THEME.border,
  text: THEME.text, dim: THEME.dim, dim2: THEME.dim3,
  accent: THEME.accent, green: THEME.success, red: THEME.danger, yellow: THEME.warning, purple: THEME.purple,
}

const FIELD_META = [
  { key: 'username', label: '用户名', max: 24, placeholder: '显示给其他玩家的名字', kind: 'username' },
  { key: 'motto',    label: '个性签名', max: 80, placeholder: '大厅展示的一句话' },
  { key: 'gender',   label: '性别',    max: 8,  placeholder: '如 男 / 女 / 未知' },
  { key: 'killmsg',  label: '击杀宣言', max: 60, placeholder: '击败其他实体时显示' },
  { key: 'lastword', label: '阵亡遗言', max: 60, placeholder: '倒下时显示' },
]

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ username: '', motto: '', gender: '', killmsg: '', lastword: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [portraitOpen, setPortraitOpen] = useState(false)
  const [portraitUrl, setPortraitUrl] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await getGameApi('/api/profile')
      setData(res)
      const p = res.profile || {}
      setForm({
        username: res.username || '',
        motto: p.motto || '',
        gender: p.gender || '',
        killmsg: p.killmsg || '',
        lastword: p.lastword || '',
      })
      setPortraitUrl(res.portrait?.status === 'approved' ? res.portrait.image_url : null)
    } catch (e) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (user) load() }, [user])

  async function handleSave() {
    setSaving(true); setSaved(false); setError('')
    try {
      await postGameApi('/api/profile', { action: 'update_info', ...form })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!user && !authLoading) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: C.dim, fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: C.accent }}>登录</Link> 后查看个人主页
        </p>
      </div>
    )
  }
  if (loading || authLoading) return <Spinner />

  const profile = data?.profile || {}
  const stats = [
    { label: '有效局数', value: profile.validgames ?? 0, color: C.accent },
    { label: '撤离/胜局', value: profile.wingames ?? 0, color: C.green },
    { label: 'ELO 评分', value: profile.elo_rating ?? '—', color: C.purple },
    { label: '点数 credits', value: profile.credits ?? 0, color: C.yellow },
    { label: 'gold', value: profile.gold ?? 0, color: C.yellow },
  ]

  return (
    <div className="animate-in" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>个人主页</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.dim }}>
          配置你的账户情报与角色立绘。立绘上传后需管理员审核，通过后即可在游戏内展示。
        </p>
      </div>

      {error && <div style={{ color: C.red, padding: 12, background: `${C.red}10`, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        {/* 左：立绘 */}
        <div>
          <div
            onClick={() => setPortraitOpen(true)}
            style={{
              aspectRatio: '3 / 5', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
              background: portraitUrl ? C.bg0 : `linear-gradient(135deg, ${C.bg2}, ${C.bg0})`,
              border: `1px solid ${C.border}`, position: 'relative',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}
          >
            {portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portraitUrl} alt="立绘" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.dim }}>
                <div style={{ fontSize: 56, opacity: 0.4 }}>👤</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>未选择立绘</div>
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px', background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', fontSize: 11, color: C.text, textAlign: 'center' }}>
              点击管理立绘
            </div>
          </div>
          <button
            onClick={() => setPortraitOpen(true)}
            style={{ width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 8, border: `1px solid ${C.accent}40`, background: `${C.accent}18`, color: C.accent, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            🎴 选择 / 上传立绘
          </button>
        </div>

        {/* 右：账户情报 + 统计 */}
        <div>
          {/* 账户情报表单 */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>账户情报</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FIELD_META.map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: 11, color: C.dim, marginBottom: 4 }}>
                    {f.label} <span style={{ color: C.dim2 }}>({(form[f.key] || '').length}/{f.max})</span>
                  </label>
                  <input
                    value={form[f.key] || ''}
                    maxLength={f.max}
                    placeholder={f.placeholder}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: C.bg0, color: C.text, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '保存中…' : '保存账户情报'}
              </button>
              {saved && <span style={{ color: C.green, fontSize: 12 }}>✓ 已保存</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim2 }}>{data?.email}</span>
            </div>
          </div>

          {/* 战绩统计（只读） */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>战绩统计</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              {stats.map(s => (
                <div key={s.label} style={{ padding: '10px 12px', borderRadius: 8, background: C.bg0, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: 10, color: C.dim }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'monospace', marginTop: 2 }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.dim2, marginTop: 10 }}>
              战绩为只读，由对局结算自动更新。
            </div>
          </div>
        </div>
      </div>

      <PortraitSelectorModal
        open={portraitOpen}
        onClose={() => setPortraitOpen(false)}
        onSelected={(_pid, url) => { setPortraitUrl(url); load() }}
      />
    </div>
  )
}
