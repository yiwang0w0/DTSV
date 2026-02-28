'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error, data } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      // 登录后更新元数据以确保管理员用户组信息
      if (data?.user) {
        const { user } = data
        // 直接调用服务端函数：
        // 这里简单重复一次后端的邮箱判断，如果需要可移入 authjs
        if (user.email === '2949215486@qq.com' && !(user.user_metadata?.groups || []).includes('admin')) {
          await supabase.auth.updateUser({ data: { ...user.user_metadata, groups: [...(user.user_metadata?.groups||[]), 'admin'] } })
        }
      }
      router.push('/')
    }
  }

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 8,
    border: '1px solid #30363d', background: '#161b22', color: '#e6edf3',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div className="animate-in" style={{ maxWidth: 400, margin: '60px auto' }}>
      <div style={{ background: '#1c2129', borderRadius: 16, border: '1px solid #30363d', padding: 32 }}>
        <h2 style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 22 }}>登录</h2>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>邮箱</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={inputStyle} placeholder="your@email.com" required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={inputStyle} placeholder="••••••••" required />
          </div>
          {error && <div style={{ color: '#f85149', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(248,81,73,0.1)', borderRadius: 8 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px', borderRadius: 8, border: 'none',
            background: '#58a6ff', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>{loading ? '登录中...' : '登录'}</button>
        </form>
        <p style={{ textAlign: 'center', margin: '16px 0 0', fontSize: 13, color: '#8b949e' }}>
          没有账号？ <Link href="/register" style={{ color: '#58a6ff', textDecoration: 'none' }}>注册</Link>
        </p>
      </div>
    </div>
  )
}
