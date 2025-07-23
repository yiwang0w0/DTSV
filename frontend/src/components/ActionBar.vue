<template>
  <div class="action-bar">
    <el-select v-model="val" placeholder="选择地点" style="width: 180px" @change="handleChange">
      <el-option v-for="(n, i) in places" :key="i" :label="n" :value="i" />
    </el-select>
    <el-button @click="$emit('move')">移动</el-button>
    <el-button @click="$emit('search')">搜索</el-button>
    <el-button @click="$emit('rest')">休息</el-button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  modelValue: Number,
  places: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue','change','move','search','rest'])
const val = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})
function handleChange(v){
  emit('change', v)
}
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
