<template>
  <div class="page">
    <h2>进入游戏</h2>
    <el-select v-model="selected" placeholder="选择职业" style="width: 200px;">
      <el-option v-for="c in clubs" :key="c.cid" :label="c.name" :value="c.cid" />
    </el-select>
    <el-button type="primary" @click="start" style="margin-left:10px;">进入</el-button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { enterGame, getStatus, getDeadStatus, getClubs } from '../api'
import { playerId } from '../store/user'
import { playerInfo } from '../store/player'
import { logs, resetLogs } from '../store/logs'
import { resetChats } from '../store/chat'

const router = useRouter()
const clubs = ref([])
const selected = ref()

async function start() {
  try {
    const oldPid = playerId.value
    resetLogs(oldPid)
    resetChats(oldPid)
    playerId.value = ''
    const { data } = await enterGame({ club: selected.value })
    playerId.value = data.pid
    try {
      const status = await getStatus(data.pid)
      playerInfo.value = status.data
      router.push('/game')
    } catch (err) {
      if (err.response?.data?.msg === '你已经死亡') {
        const res = await getDeadStatus(data.pid)
        playerInfo.value = res.data
        router.push('/gameover')
      } else {
        throw err
      }
    }
  } catch (e) {
    const msg = e.response?.data?.msg
    alert(msg || '进入失败')
  }
}

onMounted(async () => {
  const res = await getClubs()
  clubs.value = res.data
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    playerInfo.value = data
    router.replace('/game')
  } catch (e) {
    if (e.response?.data?.msg === '你已经死亡') {
      const res = await getDeadStatus(playerId.value)
      playerInfo.value = res.data
      router.replace('/gameover')
    }
  }
})
</script>

<style scoped>
@import '../styles/dark-theme.css';
.page { padding: 20px; }
</style>
