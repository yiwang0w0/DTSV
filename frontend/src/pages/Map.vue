<template>
  <div class="map-page">
    <h2 class="title">游戏界面</h2>
    <div class="layout">
      <div class="left-panel">
        <!-- 玩家数值区 -->
        <el-card class="card-section" header="状态" v-if="info">
          <p>玩家名：{{ info.name }}</p>
          <p>攻击力：{{ info.att }}</p>
          <p>防御力：{{ info.def }}</p>
          <p>等级：{{ info.lvl }}</p>
          <p>金钱：{{ info.money }}</p>
        </el-card>

        <!-- 已装备列表 -->
        <el-card class="card-section" header="已装备" v-if="info">
          <el-table :data="equipRows" size="small" style="width: 100%">
            <el-table-column prop="slot" label="装备种类" width="80" />
            <el-table-column prop="name" label="装备名称" />
            <el-table-column prop="attr" label="属性" width="80" />
            <el-table-column prop="effect" label="效果" width="80" />
            <el-table-column prop="dur" label="耐久" width="80" />
          </el-table>
        </el-card>

        <!-- 历史日志 -->
        <el-card class="log-panel" shadow="never" v-if="logs.length">
          <div v-for="(l, i) in logs" :key="i" v-html="l" class="log-item" />
        </el-card>
      </div>

      <div class="right-panel">
        <!-- 当前地图状态 -->
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

        <!-- 行动区 -->
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

        <!-- 背包 -->
        <InventoryPanel />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import InventoryPanel from '../components/InventoryPanel.vue'
import { move, search, getStatus, getMapAreas, rest, pickItem } from '../api'

import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import { mapAreas as places } from '../store/map'
import { logs } from '../store/logs'

const target = ref(0)
const log = ref('')

const equipRows = computed(() => {
  if (!info.value) return []
  return [
    { slot: '武器', name: info.value.wep, attr: info.value.wepk, effect: info.value.wepe, dur: info.value.weps },
    { slot: '身体', name: info.value.arb, attr: info.value.arbk, effect: info.value.arbe, dur: info.value.arbs },
    { slot: '头部', name: info.value.arh, attr: info.value.arhk, effect: info.value.arhe, dur: info.value.arhs },
    { slot: '手部', name: info.value.ara, attr: info.value.arak, effect: info.value.arae, dur: info.value.aras },
    { slot: '腿部', name: info.value.arf, attr: info.value.arfk, effect: info.value.arfe, dur: info.value.arfs },
    { slot: '装饰', name: info.value.art, attr: info.value.artk, effect: info.value.arte, dur: info.value.arts }
  ]
})

function addLog(message) {
  log.value = message
  if (message) logs.value.unshift(message)
}

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
    info.value = data.player
    addLog(data.msg)
  } catch (e) {
    alert(e.response?.data?.msg || '移动失败')
  }
}

async function doSearch() {
  if (!playerId.value) return
  try {
    const { data } = await search(playerId.value)
    info.value = data.player
    let message = data.log
    if (data.item) {
      if (confirm(`发现${data.item.itm}，是否拾取？`)) {
        try {
          const ret = await pickItem(playerId.value, data.item._id)
          message += `<br>${ret.data.msg}`
          info.value = ret.data.player
        } catch (e) {
          const msg = e.response?.data?.msg
          alert(msg || '拾取失败')
        }
      }
    }
    addLog(message)
  } catch (e) {
    alert(e.response?.data?.msg || '搜索失败')
  }
}

async function doRest() {
  if (!playerId.value) return
  try {
    const { data } = await rest(playerId.value)
    info.value = data.player
    addLog(data.msg)
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

.layout {
  display: flex;
  gap: 20px;
}

.left-panel,
.right-panel {
  flex: 1;
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
