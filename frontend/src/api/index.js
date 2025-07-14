import axios from 'axios'
import { token } from '../store/user'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
})

api.interceptors.request.use(config => {
  if (token.value) {
    config.headers.Authorization = `Bearer ${token.value}`
  }
  return config
})

export const register = (username, password) =>
  api.post('/auth/register', { username, password })

export const login = (username, password) =>
  api.post('/auth/login', { username, password })

export const refresh = refreshToken =>
  api.post('/auth/refresh', { refreshToken })

export const logout = refreshToken =>
  api.post('/auth/logout', { refreshToken })

export const getGameInfo = () => api.get('/game/info')
export const startGame = () => api.post('/game/start')
export const stopGame = () => api.post('/game/stop')

export const enterGame = () => api.post('/game/enter')
export const move = (pid, pls) => api.post('/game/move', { pid, pls })
export const search = pid => api.post('/game/search', { pid })
export const getStatus = pid => api.get('/game/status', { params: { pid } })
export const getPlayers = () => api.get('/game/players')

export const adminList = col => api.get(`/admin/${col}`)
export const adminCreate = (col, data) => api.post(`/admin/${col}`, data)
export const adminUpdate = (col, id, data) => api.put(`/admin/${col}/${id}`, data)
export const adminDelete = (col, id) => api.delete(`/admin/${col}/${id}`)
export const adminFieldMeta = col => api.get(`/admin/${col}/fieldmeta`)
export const adminMaps = () => api.get('/admin/maps')

export const getProfile = () => api.get('/user/profile')
export const updateProfile = data => api.put('/user/profile', data)

export default api
