<template>
  <div class="page">
    <h2>进行状况</h2>
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
import { ref, onMounted } from 'vue'
import { getPlayers } from '../api'

const players = ref([])

async function fetch() {
  try {
    const { data } = await getPlayers()
    players.value = data
  } catch (e) {
    players.value = []
  }
}

onMounted(fetch)
</script>

<style scoped>
.page { padding: 20px; }
</style>
