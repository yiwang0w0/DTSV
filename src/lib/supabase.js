import { createClient } from '@supabase/supabase-js'

let client = null

function getEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error('Missing Supabase environment variables')
  }
  return value
}

export function getSupabaseClient() {
  if (client) return client

  client = createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  )

  return client
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const value = getSupabaseClient()[prop]
    return typeof value === 'function' ? value.bind(getSupabaseClient()) : value
  },
})
