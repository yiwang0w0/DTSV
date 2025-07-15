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
import { enterGame, getStatus, getClubs } from '../api'
import { playerId } from '../store/user'
import { playerInfo } from '../store/player'
import { logs } from '../store/logs'

const router = useRouter()
const clubs = ref([])
const selected = ref()

async function start() {
  try {
    const { data } = await enterGame({ club: selected.value })
    playerId.value = data.pid
    const status = await getStatus(data.pid)
    playerInfo.value = status.data
    logs.value = []
    router.push('/game')
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
    // ignore if player not found
  }
})
</script>

<style scoped>
.page { padding: 20px; }
</style>
