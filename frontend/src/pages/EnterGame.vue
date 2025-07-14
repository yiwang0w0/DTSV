<template>
  <div class="page">
    <h2>进入游戏</h2>
    <el-button type="primary" @click="start">进入</el-button>
  </div>
</template>

<script setup>
import { enterGame } from '../api'
import { playerId } from '../store/user'
import { useRouter } from 'vue-router'

const router = useRouter()

async function start() {
  try {
    const { data } = await enterGame()
    playerId.value = data.pid
    localStorage.setItem('playerId', data.pid)
    router.push('/map')
  } catch (e) {
    alert(e.response?.data?.msg || '进入失败')
  }
}
</script>

<style scoped>
.page { padding: 20px; }
</style>
