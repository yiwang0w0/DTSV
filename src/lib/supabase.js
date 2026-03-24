import { createClient } from '@supabase/supabase-js'

let client = null
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

function requireClientConfig() {
  if (!hasSupabaseConfig()) {
    throw new Error('Missing Supabase environment variables')
  }
}

export function getSupabaseClient() {
  if (client) return client
  requireClientConfig()

  client = createClient(
    supabaseUrl,
    supabaseAnonKey,
  )

  return client
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const value = getSupabaseClient()[prop]
    return typeof value === 'function' ? value.bind(getSupabaseClient()) : value
  },
})
