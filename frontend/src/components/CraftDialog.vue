<template>
  <el-dialog v-model="visible" title="物品合成" width="400px" @close="$emit('close')">
    <el-table :data="bagItems" @selection-change="selected = $event" style="width:100%">
      <el-table-column type="selection" width="40" />
      <el-table-column prop="name" label="物品" />
      <el-table-column prop="type" label="类型" width="90" />
      <el-table-column prop="effect" label="效果" width="70" />
      <el-table-column prop="uses" label="耐久" width="60" />
    </el-table>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="$emit('close')">取消</el-button>
        <el-button type="primary" @click="confirm" :disabled="selected.length < 2">合成</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  bagItems: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue','confirm','close'])
const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})
const selected = ref([])

function confirm(){
  emit('confirm', selected.value)
}
</script>

<style scoped>
</style>
