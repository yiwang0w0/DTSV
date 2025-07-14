<template>
  <div class="map-page">
    <h2 class="title">游戏界面</h2>

    <!-- 地图状态栏 -->
    <el-card class="card-section" shadow="hover">
      <el-row :gutter="20">
        <el-col :span="8"><strong>位置：</strong>{{ places[info.pls] }}</el-col>
        <el-col :span="8">
          <span class="label">生命：</span>
          <el-progress :percentage="hpPercent" :text-inside="true" status="success" />
        </el-col>
        <el-col :span="8">
          <span class="label">体力：</span>
          <el-progress :percentage="spPercent" :text-inside="true" status="warning" />
        </el-col>
      </el-row>
    </el-card>

    <!-- 操作区域 -->
    <div class="action-bar">
      <el-select v-model="target" placeholder="选择地点" style="width: 180px">
        <el-option v-for="(n,i) in places" :key="i" :label="n" :value="i" />
      </el-select>
      <el-button type="primary" @click="doMove">移动</el-button>
      <el-button @click="doSearch">搜索</el-button>
      <el-button @click="doRest">休息</el-button>
    </div>

    <!-- 最新日志 -->
    <p v-if="log" v-html="log" class="log-current" />

    <!-- 日志历史 -->
    <el-card class="log-panel" shadow="never" v-if="logs.length">
      <div v-for="(l, i) in logs" :key="i" v-html="l" class="log-item" />
    </el-card>

    <!-- 装备信息 -->
    <el-card class="card-section" header="装备">
      <p>武器：{{ info.wep || '无' }}</p>
      <p>防具：{{ info.arb || '无' }}</p>
    </el-card>

    <!-- 背包物品 -->
    <InventoryPanel />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import InventoryPanel from '../components/InventoryPanel.vue'
import { move, search, getStatus, getMapAreas, rest, pickItem } from '../api'

import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import { mapAreas as places } from '../store/map'
import { logs } from '../store/logs'
import InventoryPanel from '../components/InventoryPanel.vue'

const target = ref(0)
const log = ref('')

const hpPercent = computed(() =>
  info.value ? Math.round((info.value.hp / info.value.mhp) * 100) : 0
)
const spPercent = computed(() =>
  info.value ? Math.round((info.value.sp / info.value.msp) * 100) : 0
)

watch(log, val => {
  if (val) logs.value.unshift(val)
})

async function fetchStatus() {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    info.value = data
    target.value = data.pls
  } catch {
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
    alert(e.response?.data?.msg || '移动失败')
  }
}

async function doSearch() {
  if (!playerId.value) return
  try {
    const { data } = await search(playerId.value)
    log.value = data.log
    info.value = data.player
    if (data.item) {
      if (confirm(`发现${data.item.itm}，是否拾取？`)) {
        try {
          const ret = await pickItem(playerId.value, data.item._id)
          log.value += `<br>${ret.data.msg}`
          info.value = ret.data.player
        } catch (e) {
          const msg = e.response?.data?.msg
          alert(msg || '拾取失败')
        }
      }
    }
  } catch (e) {
    alert(e.response?.data?.msg || '搜索失败')
  }
}

async function doRest() {
  if (!playerId.value) return
  try {
    const { data } = await rest(playerId.value)
    log.value = data.msg
    info.value = data.player
  } catch (e) {
    alert(e.response?.data?.msg || '休息失败')
  }
}
</script>

<style scoped>
.map-page {
  padding: 30px 20px;
  max-width: 880px;
  margin: 0 auto;
}

.title {
  text-align: center;
  font-size: 24px;
  margin-bottom: 20px;
}

.card-section {
  margin-bottom: 20px;
}

.label {
  font-weight: bold;
  margin-right: 8px;
}

.action-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin: 16px 0;
}

.log-current {
  margin: 12px 0;
  color: #606266;
  font-weight: 500;
}

.log-panel {
  max-height: 200px;
  overflow-y: auto;
  background: #f9f9f9;
  padding: 10px;
  margin-bottom: 20px;
}

.log-item {
  padding: 4px 0;
  border-bottom: 1px solid #eee;
}
</style>
