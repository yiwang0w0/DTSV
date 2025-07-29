<template>
  <div class="page">
    <h2>游戏信息</h2>
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
import { getMapAreas, getPlayers } from '../api'
import { mapAreas as places } from '../store/map'
import { stateInfo } from '../constants/death'

const players = ref([])
const alivePlayers = computed(() => players.value.filter(p => p.alive))
const deadPlayers = computed(() => players.value.filter(p => !p.alive))

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
