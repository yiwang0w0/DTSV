import api from './client'

export const adminList = (col, params = {}) => api.get(`/admin/${col}`, { params })
export const adminCreate = (col, data) => api.post(`/admin/${col}`, data)
export const adminUpdate = (col, id, data) => api.put(`/admin/${col}/${id}`, data)
export const adminDelete = (col, id) => api.delete(`/admin/${col}/${id}`)
export const adminFieldMeta = col => api.get(`/admin/${col}/fieldmeta`)
export const adminMaps = () => api.get('/admin/maps')
