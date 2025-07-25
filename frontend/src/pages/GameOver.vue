<template>
  <div class="page" v-if="info">
    <h2>游戏结束</h2>
    <p><strong>{{ stateInfo[info.state] }}</strong></p>
    <div v-html="deathInfo[info.state]"></div>
    <el-button type="primary" style="margin-top:20px" @click="back">返回首页</el-button>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { playerId } from '../store/user'
import { playerInfo } from '../store/player'
import { resetLogs } from '../store/logs'
import { resetChats } from '../store/chat'
import { getDeadStatus } from '../api'
import { stateInfo, deathInfo } from '../constants/death'

const router = useRouter()
const info = playerInfo

async function back() {
  resetLogs(playerId.value)
  resetChats(playerId.value)
  playerId.value = ''
  playerInfo.value = null
  router.push('/start')
}

onMounted(async () => {
  if (!playerId.value) {
    router.replace('/start')
    return
  }
  if (!playerInfo.value) {
    try {
      const { data } = await getDeadStatus(playerId.value)
      playerInfo.value = data
    } catch {
      router.replace('/start')
    }
  }
})
</script>

<style scoped>
.page { padding: 20px; }
</style>
