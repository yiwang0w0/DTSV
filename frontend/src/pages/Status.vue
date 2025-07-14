<template>
  <div class="page">
    <h2>角色状态</h2>
    <el-descriptions v-if="info" border :column="2" style="margin-top:10px">
      <el-descriptions-item label="位置">{{ place }}</el-descriptions-item>
      <el-descriptions-item label="生命">{{ info.hp }}/{{ info.mhp }}</el-descriptions-item>
      <el-descriptions-item label="体力">{{ info.sp }}/{{ info.msp }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getStatus } from '../api'
import { playerId } from '../store/user'
import places from '../utils/places'

const info = ref(null)
const place = computed(() => info.value ? places[info.value.pls] : '')

async function fetch() {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    info.value = data
  } catch (e) {
    info.value = null
  }
}

onMounted(fetch)
</script>

<style scoped>
.page { padding: 20px; }
</style>
