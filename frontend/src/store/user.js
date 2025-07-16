import { ref, watch } from 'vue'

export const user = ref(localStorage.getItem('user') || '')
export const token = ref(localStorage.getItem('token') || '')
export const refreshToken = ref(localStorage.getItem('refreshToken') || '')
export const playerId = ref(localStorage.getItem('playerId') || '')

watch(user, val => {
  if (val) {
    localStorage.setItem('user', val)
  } else {
    localStorage.removeItem('user')
  }
})

watch(token, val => {
  if (val) {
    localStorage.setItem('token', val)
  } else {
    localStorage.removeItem('token')
  }
})

watch(refreshToken, val => {
  if (val) {
    localStorage.setItem('refreshToken', val)
  } else {
    localStorage.removeItem('refreshToken')
  }
})

watch(playerId, val => {
  if (val) {
    localStorage.setItem('playerId', val)
  } else {
    localStorage.removeItem('playerId')
  }
})
