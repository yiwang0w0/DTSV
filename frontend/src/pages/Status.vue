<template>
  <div class="page">
    <h2>角色状态</h2>
    <el-descriptions v-if="info" border :column="2" style="margin-top:10px">
      <el-descriptions-item label="位置">{{ place }}</el-descriptions-item>
      <el-descriptions-item label="生命">
        <el-progress :percentage="hpPercent" :format="hpFormat" :text-inside="true" />
      </el-descriptions-item>
      <el-descriptions-item label="体力">
        <el-progress :percentage="spPercent" :format="spFormat" :text-inside="true" />
      </el-descriptions-item>
      <el-descriptions-item label="等级">{{ info.lvl }}</el-descriptions-item>
      <el-descriptions-item label="经验">{{ info.exp }}</el-descriptions-item>
      <el-descriptions-item label="熟练度">
        <div v-for="p in profs" :key="p.label">{{ p.label }}: {{ p.val }}</div>
      </el-descriptions-item>
      <el-descriptions-item label="受伤部位">{{ injuries }}</el-descriptions-item>
    </el-descriptions>
    <h3 style="margin-top:10px">存活玩家</h3>
    <el-table :data="alivePlayers" style="width: 100%; margin-top:6px">
      <el-table-column prop="name" label="角色名" />
      <el-table-column prop="lvl" label="等级" width="80" />
    </el-table>

    <h3 style="margin-top:20px">死亡玩家</h3>
    <el-table :data="deadPlayers" style="width: 100%; margin-top:6px">
      <el-table-column prop="name" label="角色名" />
      <el-table-column prop="lvl" label="等级" width="80" />
      <el-table-column prop="state" label="死因" width="120">
        <template #default="{ row }">{{ stateInfo[row.state] }}</template>
      </el-table-column>
    </el-table>

    <div class="map-grid" v-if="places && places.value && places.value.length">
      <div
        v-for="area in places"
        :key="area.pid"
        class="grid-cell"
        :class="{ danger: area.danger === 1, warn: area.danger === 2 }"
      >
        {{ area.name }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getStatus, getMapAreas, getPlayers } from '../api'
import { playerId } from '../store/user'
import { mapAreas as places } from '../store/map'
import { stateInfo } from '../constants/death'

const info = ref(null)
const players = ref([])
const alivePlayers = computed(() => players.value.filter(p => p.alive))
const deadPlayers = computed(() => players.value.filter(p => !p.alive))
const place = computed(() => {
  if (!info.value || !places || !places.value) return ''
  const area = places.value.find(a => a.pid === info.value.pls)
  return area ? area.name : ''
})
const hpPercent = computed(() =>
  info.value ? Math.round((info.value.hp / info.value.mhp) * 100) : 0
)
const spPercent = computed(() =>
  info.value ? Math.round((info.value.sp / info.value.msp) * 100) : 0
)
const hpFormat = () => info.value ? `${info.value.hp}/${info.value.mhp}` : '0/0'
const spFormat = () => info.value ? `${info.value.sp}/${info.value.msp}` : '0/0'
const profs = computed(() => {
  if (!info.value) return []
  return [
    { label: '殴', val: info.value.wp },
    { label: '斩', val: info.value.wk },
    { label: '射', val: info.value.wg },
    { label: '投', val: info.value.wc },
    { label: '爆', val: info.value.wd },
    { label: '灵', val: info.value.wf }
  ]
})
const injuries = computed(() => {
  if (!info.value || !info.value.inf) return '无'
  const map = { b: '胸', h: '头', a: '腕', f: '足' }
  const arr = [...info.value.inf].map(c => map[c]).filter(Boolean)
  return arr.length ? arr.join('、') : '无'
})

async function fetch() {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    info.value = data
  } catch (e) {
    info.value = null
  }
}

async function fetchPlayers() {
  try {
    const { data } = await getPlayers()
    players.value = data
  } catch (e) {
    players.value = []
  }
}

onMounted(() => {
  if (!places.value.length) {
    getMapAreas().then(({ data }) => {
      places.value = data
    }).catch(() => {})
  }
  fetch()
  fetchPlayers()
})
</script>

<style scoped>
.page { padding: 20px; }
.map-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 6px; margin-top: 20px; }
.grid-cell { border: 1px solid #ddd; padding: 4px; text-align: center; background: #f5f7fa; }
.grid-cell.danger { background: #f56c6c; color: #fff; }
.grid-cell.warn { background: #e6a23c; color: #fff; }
</style>
