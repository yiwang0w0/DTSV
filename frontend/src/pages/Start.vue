<template>
  <div class="page">
    <h2>进入游戏</h2>
    <el-button type="primary" @click="start">进入</el-button>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { enterGame, getStatus } from '../api'
import { playerId } from '../store/user'
import { playerInfo } from '../store/player'

const router = useRouter()

async function start() {
  try {
    const { data } = await enterGame()
    playerId.value = data.pid
    localStorage.setItem('playerId', data.pid)
    const status = await getStatus(data.pid)
    playerInfo.value = status.data
    router.push('/game')
  } catch (e) {
    const msg = e.response?.data?.msg
    alert(msg || '进入失败')
  }
}

onMounted(async () => {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    playerInfo.value = data
    router.replace('/game')
  } catch (e) {
    // ignore if player not found
  }
})
</script>

<style scoped>
.page { padding: 20px; }
</style>
