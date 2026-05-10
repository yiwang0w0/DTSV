'use client'
import { useState, useRef, useCallback } from 'react'
import { BTN, INPUT } from '../_shared/ui'

const DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i

const QUICK_QUERIES = [
  { label: '所有表', sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name` },
  { label: '对局列表', sql: `SELECT id, gamenum, gamestate, validnum, alivenum, deathnum, created_at FROM rooms ORDER BY created_at DESC LIMIT 20` },
  { label: '玩家状态', sql: `SELECT p.id, p.username, p.roomid, p.hp, p.atk, p.def, p.alive FROM profiles p WHERE p.roomid IS NOT NULL` },
  { label: '道具池', sql: `SELECT * FROM item_pool ORDER BY kind, name` },
  { label: 'NPC 池', sql: `SELECT * FROM npc_pool ORDER BY level, name` },
  { label: '地图配置', sql: `SELECT map_id, weather, npc_count FROM map_config ORDER BY map_id LIMIT 20` },
  { label: '游戏日志（最近）', sql: `SELECT * FROM game_events ORDER BY created_at DESC LIMIT 30` },
]

export default function DbConsoleTab({ toast }) {
  const [sql, setSql] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [confirmPending, setConfirmPending] = useState(false)
  const textareaRef = useRef(null)

  const getAuthToken = useCallback(async () => {
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token
  }, [])

  const executeQuery = useCallback(async (query, confirmed = false) => {
    if (!query.trim()) return

    // 危险操作需要确认
    if (!confirmed && DANGEROUS_KEYWORDS.test(query)) {
      setConfirmPending(true)
      return
    }

    setConfirmPending(false)
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const token = await getAuthToken()
      const res = await fetch('/api/admin/db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sql: query }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data)
        toast?.(data.error || '查询失败', 'error')
      } else {
        setResult(data)
        // 添加到历史记录
        setHistory(prev => {
          const next = [{ sql: query, time: new Date().toLocaleTimeString(), rowCount: data.rowCount }, ...prev]
          return next.slice(0, 20)
        })
        if (data.isDangerous) {
          toast?.(`执行成功，影响 ${data.rowCount} 行`, 'success')
        }
      }
    } catch (err) {
      setError({ error: err.message || '网络错误' })
      toast?.(err.message || '网络错误', 'error')
    } finally {
      setLoading(false)
    }
  }, [getAuthToken, toast])

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      executeQuery(sql)
    }
    // Tab 插入空格
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const val = e.target.value
      setSql(val.substring(0, start) + '  ' + val.substring(end))
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2
      }, 0)
    }
  }

  const columns = result?.data?.length > 0 ? Object.keys(result.data[0]) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 快捷查询 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, lineHeight: '28px' }}>快捷查询：</span>
        {QUICK_QUERIES.map(q => (
          <button
            key={q.label}
            onClick={() => { setSql(q.sql); setConfirmPending(false) }}
            style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid #30363d',
              background: '#161b22', color: '#58a6ff', fontSize: 11, cursor: 'pointer',
              fontWeight: 500, transition: 'border-color .15s',
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* SQL 输入区 */}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={e => { setSql(e.target.value); setConfirmPending(false) }}
          onKeyDown={handleKeyDown}
          placeholder="输入 SQL 查询语句... (Ctrl+Enter 执行)"
          rows={6}
          style={{
            ...INPUT,
            fontFamily: 'var(--font-jetbrains-mono), Consolas, Monaco, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            resize: 'vertical',
            minHeight: 120,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#484f58' }}>
            {sql.length > 0 && `${sql.length} 字符`}
            {DANGEROUS_KEYWORDS.test(sql) && (
              <span style={{ color: '#d29922', marginLeft: 8 }}>⚠ 写操作</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {sql.trim() && (
              <button
                onClick={() => { setSql(''); setResult(null); setError(null); setConfirmPending(false) }}
                style={BTN('transparent', '#8b949e', { border: '1px solid #30363d', padding: '6px 14px' })}
              >
                清空
              </button>
            )}
            <button
              onClick={() => executeQuery(sql)}
              disabled={loading || !sql.trim()}
              style={BTN(
                loading || !sql.trim() ? '#21262d' : '#238636',
                loading || !sql.trim() ? '#484f58' : '#fff',
                { padding: '6px 18px' }
              )}
            >
              {loading ? '执行中...' : '▶ 执行'}
            </button>
          </div>
        </div>
      </div>

      {/* 危险操作确认 */}
      {confirmPending && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#d29922' }}>⚠ 这是一个写操作</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>此操作可能会修改数据库，确定要执行吗？</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmPending(false)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d', padding: '6px 14px' })}>取消</button>
            <button onClick={() => executeQuery(sql, true)} style={BTN('#da3633', '#fff', { padding: '6px 14px' })}>确认执行</button>
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f85149' }}>查询出错</div>
          <div style={{ fontSize: 12, color: '#f0883e', marginTop: 6, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
            {error.error}
          </div>
          {error.hint && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>提示: {error.hint}</div>}
          {error.code && <div style={{ fontSize: 11, color: '#484f58', marginTop: 2 }}>错误代码: {error.code}</div>}
        </div>
      )}

      {/* 查询结果 */}
      {result?.data && (
        <div>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>返回 <span style={{ color: '#58a6ff', fontWeight: 700 }}>{result.rowCount}</span> 行</span>
            <span>{columns.length} 列</span>
          </div>

          {result.data.length === 0 ? (
            <div style={{
              padding: '40px 20px', textAlign: 'center', color: '#484f58',
              background: '#161b22', borderRadius: 10, border: '1px solid #21262d',
            }}>
              查询成功，无返回数据
            </div>
          ) : (
            <div style={{
              overflowX: 'auto', borderRadius: 10,
              border: '1px solid #30363d', background: '#0d1117',
            }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 12, fontFamily: 'var(--font-jetbrains-mono), monospace',
              }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #30363d',
                      background: '#161b22', color: '#8b949e', fontSize: 11,
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                      position: 'sticky', top: 0,
                    }}>#</th>
                    {columns.map(col => (
                      <th key={col} style={{
                        padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #30363d',
                        background: '#161b22', color: '#8b949e', fontSize: 11,
                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                        position: 'sticky', top: 0, whiteSpace: 'nowrap',
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '8px 14px', color: '#484f58', fontSize: 11 }}>{i + 1}</td>
                      {columns.map(col => {
                        const val = row[col]
                        const display = val === null ? 'NULL' : typeof val === 'object' ? JSON.stringify(val) : String(val)
                        const isNull = val === null
                        return (
                          <td key={col} style={{
                            padding: '8px 14px',
                            color: isNull ? '#484f58' : '#e6edf3',
                            fontStyle: isNull ? 'italic' : 'normal',
                            maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                            title={display}
                          >
                            {display}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#8b949e', fontWeight: 600, marginBottom: 8 }}>历史记录</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map((h, i) => (
              <div
                key={i}
                onClick={() => setSql(h.sql)}
                style={{
                  padding: '8px 12px', borderRadius: 6, background: '#161b22',
                  border: '1px solid #21262d', cursor: 'pointer', fontSize: 12,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'border-color .15s',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#8b949e',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>
                  {h.sql}
                </span>
                <span style={{ fontSize: 11, color: '#484f58', marginLeft: 12, whiteSpace: 'nowrap' }}>
                  {h.rowCount} 行 · {h.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
