<template>
  <div class="page">
    <h2>地图</h2>
    <el-descriptions v-if="info" border :column="2" style="margin-bottom:8px">
      <el-descriptions-item label="位置">{{ places[info.pls] }}</el-descriptions-item>
      <el-descriptions-item label="生命">
        <el-progress :percentage="hpPercent" :text-inside="true" />
      </el-descriptions-item>
      <el-descriptions-item label="体力">
        <el-progress :percentage="spPercent" :text-inside="true" />
      </el-descriptions-item>
    </el-descriptions>
    <el-select v-model="target" placeholder="选择地点" style="width: 200px">
      <el-option v-for="(n,i) in places" :key="i" :label="n" :value="i" />
    </el-select>
    <el-button type="primary" @click="doMove" style="margin-left:8px">移动</el-button>
    <el-button @click="doSearch" style="margin-left:8px">搜索</el-button>
    <el-button @click="doRest" style="margin-left:8px">休息</el-button>
    <el-button @click="showBag = true" style="margin-left:8px">背包</el-button>
    <p v-html="log" class="log"></p>
    <Inventory v-model="showBag" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import Inventory from '../components/Inventory.vue'
import { move, search, getStatus, getMapAreas, rest } from '../api'
import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import { mapAreas as places } from '../store/map'

const target = ref(0)
const log = ref('')
const showBag = ref(false)

const hpPercent = computed(() =>
  info.value ? Math.round((info.value.hp / info.value.mhp) * 100) : 0
)
const spPercent = computed(() =>
  info.value ? Math.round((info.value.sp / info.value.msp) * 100) : 0
)

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
</style>
