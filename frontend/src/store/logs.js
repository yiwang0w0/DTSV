import { ref, watch } from 'vue'

export const logs = ref(JSON.parse(localStorage.getItem('logs') || '[]'))

watch(logs, val => {
  if (val && val.length) {
    localStorage.setItem('logs', JSON.stringify(val.slice(0, 50)))
  } else {
    localStorage.removeItem('logs')
  }
}, { deep: true })
