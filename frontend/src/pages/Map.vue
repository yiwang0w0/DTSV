<template>
  <div class="page">
    <h2>地图</h2>
    <el-descriptions v-if="info" border :column="2" style="margin-bottom:8px">
      <el-descriptions-item label="位置">{{ places[info.pls] }}</el-descriptions-item>
      <el-descriptions-item label="生命">{{ info.hp }}/{{ info.mhp }}</el-descriptions-item>
      <el-descriptions-item label="体力">{{ info.sp }}/{{ info.msp }}</el-descriptions-item>
    </el-descriptions>
    <el-select v-model="target" placeholder="选择地点" style="width: 200px">
      <el-option v-for="(n,i) in places" :key="i" :label="n" :value="i" />
    </el-select>
    <el-button type="primary" @click="doMove" style="margin-left:8px">移动</el-button>
    <el-button @click="doSearch" style="margin-left:8px">搜索</el-button>
    <p v-html="log" class="log"></p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { move, search, getStatus } from '../api'
import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import places from '../utils/places'

const target = ref(0)
const log = ref('')

async function fetchStatus() {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    info.value = data
    target.value = data.pls
  } catch (e) {
    info.value = null
  }
}

onMounted(() => {
  if (info.value) target.value = info.value.pls
  else fetchStatus()
})

async function doMove() {
  if (!playerId.value) return
  try {
    const { data } = await move(playerId.value, target.value)
    log.value = data.msg
    info.value = data.player
  } catch (e) {
    const msg = e.response?.data?.msg
    alert(msg || '移动失败')
  }
}

async function doSearch() {
  if (!playerId.value) return
  try {
    const { data } = await search(playerId.value)
    log.value = data.log
    info.value = data.player
  } catch (e) {
    const msg = e.response?.data?.msg
    alert(msg || '搜索失败')
  }
}
</script>

<style scoped>
.page { padding: 20px; }
</style>
