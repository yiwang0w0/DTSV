<template>
  <div v-if="foundItem" class="card-section search-result">
    <p>发现 {{ foundItem.itm }}</p>
    <el-button size="small" @click="$emit('pick')">拾取</el-button>
    <el-button size="small" v-if="isEquip(foundItem.itmk)" @click="$emit('equip')">装备</el-button>
  </div>
  <el-dialog v-model="visible" title="选择替换物品" width="400px" @close="$emit('close')">
    <el-table :data="bagItems" style="width:100%">
      <el-table-column prop="name" label="物品" />
      <el-table-column prop="type" label="类型" width="90" />
      <el-table-column prop="effect" label="效果" width="70" />
      <el-table-column prop="uses" label="耐久" width="60" />
      <el-table-column label="操作" width="80">
        <template #default="{ $index }">
          <el-button size="small" @click="$emit('replace', $index)">替换</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  foundItem: Object,
  modelValue: Boolean,
  bagItems: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue','replace','close','pick','equip'])
const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})
function isEquip(kind){
  return /^(W|DB|DH|DA|DF|A)/.test(kind)
}
</script>

<style scoped>
.card-section {
  margin-bottom: 20px;
}
.search-result {
  background: #fdfdfd;
}
</style>
