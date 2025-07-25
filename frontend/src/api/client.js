import axios from 'axios'
import { ElMessageBox } from 'element-plus'
import router from '../router'
import { user, token, refreshToken, playerId } from '../store/user'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
})

api.interceptors.request.use(config => {
  if (token.value) {
    config.headers.Authorization = `Bearer ${token.value}`
  }
  return config
})

let showingExpired = false

api.interceptors.response.use(
  response => response,
  async error => {
    const msg = error.response?.data?.msg
    if (error.response?.status === 401 && msg === '令牌过期' && !showingExpired) {
      showingExpired = true
      await ElMessageBox.alert('登录已过期，请重新登录', '提示', {
        confirmButtonText: '返回主页',
        callback: () => {
          user.value = ''
          token.value = ''
          refreshToken.value = ''
          playerId.value = ''
          localStorage.removeItem('user')
          localStorage.removeItem('token')
          localStorage.removeItem('refreshToken')
          localStorage.removeItem('playerId')
          router.push('/')
          showingExpired = false
        }
      })
    }
    return Promise.reject(error)
  }
)

export default api
