<template>
  <el-card class="log-panel" shadow="never" v-if="logs && logs.length">
    <div v-for="(l, i) in logs" :key="i" v-html="l" class="log-item" />
  </el-card>
</template>

<script setup>
defineProps({
  logs: Array
})
</script>

<style scoped>
.log-panel {
  max-height: 200px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid #333;
  padding: 10px;
  margin-bottom: 20px;
}

.log-item {
  padding: 4px 0;
  border-bottom: 1px solid #eee;
}
</style>
