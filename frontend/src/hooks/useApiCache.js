import { ref, reactive } from 'vue'

class ApiCache {
  constructor() {
    this.cache = reactive(new Map())
    this.timestamps = reactive(new Map())
    this.ttl = 5 * 60 * 1000 // 5分钟缓存
  }

  set(key, data) {
    this.cache.set(key, data)
    this.timestamps.set(key, Date.now())
  }

  get(key) {
    if (!this.cache.has(key)) return null
    
    const timestamp = this.timestamps.get(key)
    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(key)
      this.timestamps.delete(key)
      return null
    }
    
    return this.cache.get(key)
  }

  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (pattern instanceof RegExp ? pattern.test(key) : key.includes(pattern)) {
        this.cache.delete(key)
        this.timestamps.delete(key)
      }
    }
  }

  clear() {
    this.cache.clear()
    this.timestamps.clear()
  }
}

const apiCache = new ApiCache()

export function useApiCache() {
  return apiCache
}