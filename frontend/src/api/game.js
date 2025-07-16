import api from './client'

export const getGameInfo = () => api.get('/game/info')
export const startGame = () => api.post('/game/start')
export const stopGame = () => api.post('/game/stop')

export const enterGame = data => api.post('/game/enter', data)
export const move = (pid, pls) => api.post('/game/move', { pid, pls })
export const search = pid => api.post('/game/search', { pid })
export const getStatus = pid => api.get('/game/status', { params: { pid } })
export const getDeadStatus = pid => api.get('/game/deadstatus', { params: { pid } })
export const getPlayers = () => api.get('/game/players')
export const getMapAreas = () => api.get('/game/mapareas')
export const getClubs = () => api.get('/game/clubs')
export const rest = pid => api.post('/game/rest', { pid })
export const pickItem = (pid, itemId) => api.post('/game/pick', { pid, itemId })
export const pickReplace = (pid, itemId, index) =>
  api.post('/game/pickreplace', { pid, itemId, index })
export const pickEquip = (pid, itemId) =>
  api.post('/game/pickequip', { pid, itemId })
export const useItem = (pid, index) => api.post('/game/use', { pid, index })
export const equipItem = (pid, index) => api.post('/game/equip', { pid, index })
export const unequipItem = (pid, slot) => api.post('/game/unequip', { pid, slot })
export const attack = (pid, eid) => api.post('/game/attack', { pid, eid })
export const escapeBattle = (pid, eid) => api.post('/game/escape', { pid, eid })
