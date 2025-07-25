<template>
  <el-card class="map-buttons-card" shadow="hover">
    <div class="map-buttons">
      <el-button
        v-for="area in areas"
        :key="area.pid"
        class="map-btn"
        :style="buttonStyle(area)"
        size="small"
        @click="handleClick(area.pid)"
      >
        {{ area.name }}
      </el-button>
    </div>
  </el-card>
</template>

<script setup>
const props = defineProps({
  areas: { type: Array, default: () => [] }
})
const emit = defineEmits(['move'])
function handleClick(pid) {
  emit('move', pid)
}
function buttonStyle(area) {
  if (area.danger === 1) {
    return 'background-color:#f56c6c;color:#fff'
  }
  if (area.danger === 2) {
    return 'background-color:#e6a23c;color:#fff'
  }
  return ''
}
</script>

<style scoped>
.map-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.map-btn {
  width: 80px;
}
.map-buttons-card {
  margin-top: 20px;
}
</style>
