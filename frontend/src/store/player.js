import { ref, watch } from 'vue'

export const playerInfo = ref(JSON.parse(localStorage.getItem('playerInfo') || 'null'))

watch(playerInfo, val => {
  if (val) {
    localStorage.setItem('playerInfo', JSON.stringify(val))
  } else {
    localStorage.removeItem('playerInfo')
  }
}, { deep: true })
