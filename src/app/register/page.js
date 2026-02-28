'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    // 默认为普通用户，注册时设定分组信息；如果是指定管理员邮箱则自动加上 admin
    const metadata = { username, groups: ['user'] }
    if (email === '2949215486@qq.com') {
      metadata.groups.push('admin')
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
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
        <h2 style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 22 }}>注册</h2>
        <form onSubmit={handleRegister}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>用户名</label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              style={inputStyle} placeholder="你的游戏昵称" required />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>邮箱</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={inputStyle} placeholder="your@email.com" required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={inputStyle} placeholder="至少6位" required minLength={6} />
          </div>
          {error && <div style={{ color: '#f85149', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(248,81,73,0.1)', borderRadius: 8 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px', borderRadius: 8, border: 'none',
            background: '#3fb950', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>{loading ? '注册中...' : '注册'}</button>
        </form>
        <p style={{ textAlign: 'center', margin: '16px 0 0', fontSize: 13, color: '#8b949e' }}>
          已有账号？ <Link href="/login" style={{ color: '#58a6ff', textDecoration: 'none' }}>登录</Link>
        </p>
      </div>
    </div>
  )
}
