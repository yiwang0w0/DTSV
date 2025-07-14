import { ref } from 'vue'

export const user = ref(localStorage.getItem('user') || '')
export const token = ref(localStorage.getItem('token') || '')
export const refreshToken = ref(localStorage.getItem('refreshToken') || '')
export const playerId = ref(localStorage.getItem('playerId') || '')
