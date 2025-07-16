import axios from 'axios'
import { token, refreshToken } from '../store/user'

// 独立实例用于刷新令牌，避免递归拦截
const refreshRequest = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
})

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
})

api.interceptors.request.use(config => {
  if (token.value) {
    config.headers.Authorization = `Bearer ${token.value}`
  }
  return config
})

let refreshing = false
let pending = []

function processPending(newToken) {
  pending.forEach(cb => cb(newToken))
  pending = []
}

api.interceptors.response.use(
  res => res,
  async error => {
    const { config, response } = error
    if (response && response.status === 401 && !config.__isRetry && refreshToken.value) {
      config.__isRetry = true
      if (!refreshing) {
        refreshing = true
        try {
          const { data } = await refreshRequest.post('/auth/refresh', { refreshToken: refreshToken.value })
          token.value = data.token
          localStorage.setItem('token', token.value)
          processPending(token.value)
        } catch (e) {
          token.value = ''
          refreshToken.value = ''
          localStorage.removeItem('token')
          localStorage.removeItem('refreshToken')
          processPending(null)
          refreshing = false
          return Promise.reject(e)
        }
        refreshing = false
      }

      return new Promise(resolve => {
        pending.push(newToken => {
          if (newToken) {
            config.headers.Authorization = `Bearer ${newToken}`
            resolve(api(config))
          } else {
            resolve(Promise.reject(error))
          }
        })
      })
    }
    return Promise.reject(error)
  }
)

export default api
