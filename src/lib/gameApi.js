import { supabase } from './supabase'

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token
}

const CLIENT_RETRIES = 2

export async function postGameApi(path, body) {
  const token = await getAccessToken()

  for (let attempt = 0; attempt <= CLIENT_RETRIES; attempt++) {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })

    const payload = await response.json().catch(() => ({}))

    if (response.status === 409 && attempt < CLIENT_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
      continue
    }

    if (!response.ok) {
      throw new Error(payload.error || '请求失败')
    }
    return payload
  }
}
