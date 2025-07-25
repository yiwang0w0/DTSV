<template>
  <div class="action-bar">
    <el-button @click="$emit('search')">搜索</el-button>
    <el-button @click="$emit('rest')">休息</el-button>
  </div>
</template>

<script setup>
const emit = defineEmits(['search','rest'])
</script>

<style scoped>
.action-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin: 16px 0;
}
</style>
