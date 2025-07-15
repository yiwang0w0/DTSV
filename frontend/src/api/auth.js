import api from './client'

export const register = (username, password) =>
  api.post('/auth/register', { username, password })

export const login = (username, password) =>
  api.post('/auth/login', { username, password })

export const refresh = refreshToken =>
  api.post('/auth/refresh', { refreshToken })

export const logout = refreshToken =>
  api.post('/auth/logout', { refreshToken })
