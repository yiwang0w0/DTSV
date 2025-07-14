<template>
  <div class="page">
    <h2>地图</h2>
    <el-select v-model="target" placeholder="选择地点" style="width: 200px">
      <el-option v-for="(n,i) in places" :key="i" :label="n" :value="i" />
    </el-select>
    <el-button type="primary" @click="doMove" style="margin-left:8px">移动</el-button>
    <el-button @click="doSearch" style="margin-left:8px">搜索</el-button>
    <p v-html="log" class="log"></p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { move, search } from '../api'
import { playerId } from '../store/user'
import places from '../utils/places'

const target = ref(0)
const log = ref('')

async function doMove() {
  if (!playerId.value) return
  try {
    const { data } = await move(playerId.value, target.value)
    log.value = data.msg
  } catch (e) {
    alert(e.response?.data?.msg || '移动失败')
  }
}

async function doSearch() {
  if (!playerId.value) return
  try {
    const { data } = await search(playerId.value)
    log.value = data.log
  } catch (e) {
    alert(e.response?.data?.msg || '搜索失败')
  }
}
</script>

<style scoped>
.page { padding: 20px; }
</style>
