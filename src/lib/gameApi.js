import { supabase } from './supabase'

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token
}

export async function postGameApi(path, body) {
  const token = await getAccessToken()
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || '请求失败')
  }
  return payload
}

