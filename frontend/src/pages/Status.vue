<template>
  <div class="page">
    <h2>角色状态</h2>
    <el-descriptions v-if="info" border :column="2" style="margin-top:10px">
      <el-descriptions-item label="位置">{{ place }}</el-descriptions-item>
      <el-descriptions-item label="生命">
        <el-progress :percentage="hpPercent" :text-inside="true" />
      </el-descriptions-item>
      <el-descriptions-item label="体力">
        <el-progress :percentage="spPercent" :text-inside="true" />
      </el-descriptions-item>
      <el-descriptions-item label="等级">{{ info.lvl }}</el-descriptions-item>
      <el-descriptions-item label="经验">{{ info.exp }}</el-descriptions-item>
      <el-descriptions-item label="熟练度">
        <div v-for="p in profs" :key="p.label">{{ p.label }}: {{ p.val }}</div>
      </el-descriptions-item>
      <el-descriptions-item label="受伤部位">{{ injuries }}</el-descriptions-item>
    </el-descriptions>
    <h2 style="margin-top:20px">进行状况</h2>
    <el-table :data="players" style="width: 100%; margin-top:10px">
      <el-table-column prop="name" label="角色名" />
      <el-table-column prop="username" label="用户" />
      <el-table-column prop="alive" label="存活">
        <template #default="scope">
          <span>{{ scope.row.alive ? '是' : '否' }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getStatus, getMapAreas, getPlayers } from '../api'
import { playerId } from '../store/user'
import { mapAreas as places } from '../store/map'

const info = ref(null)
const players = ref([])
const place = computed(() => info.value ? places[info.value.pls] : '')
const hpPercent = computed(() =>
  info.value ? Math.round((info.value.hp / info.value.mhp) * 100) : 0
)
const spPercent = computed(() =>
  info.value ? Math.round((info.value.sp / info.value.msp) * 100) : 0
)
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
</style>
