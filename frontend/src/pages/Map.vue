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
    <el-button @click="doRest" style="margin-left:8px">休息</el-button>
    <el-button @click="showBag = true" style="margin-left:8px">背包</el-button>
    <p v-html="log" class="log"></p>
    <div class="log-panel" v-if="logs.length">
      <p v-for="(l,i) in logs" :key="i" v-html="l"></p>
    </div>
    <Inventory v-model="showBag" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import Inventory from '../components/Inventory.vue'
import { move, search, getStatus, getMapAreas, rest } from '../api'
import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import { mapAreas as places } from '../store/map'
import { logs } from '../store/logs'

const target = ref(0)
const log = ref('')
const showBag = ref(false)

watch(log, val => {
  if (val) logs.value.unshift(val)
})

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
  if (!places.value.length) {
    getMapAreas().then(({ data }) => {
      places.value = data
    }).catch(() => {})
  }
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

async function doRest() {
  if (!playerId.value) return
  try {
    const { data } = await rest(playerId.value)
    log.value = data.msg
    info.value = data.player
  } catch (e) {
    const msg = e.response?.data?.msg
    alert(msg || '休息失败')
  }
}
</script>

<style scoped>
.page { padding: 20px; }
.log-panel {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid #ccc;
  padding: 4px 8px;
  margin-top: 8px;
  background: #f8f8f8;
}
</style>
