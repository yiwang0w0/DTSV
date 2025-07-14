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
    </el-descriptions>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getStatus, getMapAreas } from '../api'
import { playerId } from '../store/user'
import { mapAreas as places } from '../store/map'

const info = ref(null)
const place = computed(() => info.value ? places[info.value.pls] : '')
const hpPercent = computed(() =>
  info.value ? Math.round((info.value.hp / info.value.mhp) * 100) : 0
)
const spPercent = computed(() =>
  info.value ? Math.round((info.value.sp / info.value.msp) * 100) : 0
)

async function fetch() {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    info.value = data
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
  fetch()
})
</script>

<style scoped>
.page { padding: 20px; }
</style>
