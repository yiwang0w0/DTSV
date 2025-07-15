<template>
  <el-table
    :data="items"
    style="margin-top: 20px"
    row-key="_id"
    v-infinite-scroll="handleLoadMore"
    :infinite-scroll-distance="10"
    v-loading="loading"
  >
    <el-table-column prop="_id" label="ID" width="230" />
    <el-table-column v-for="f in fieldMeta" :key="f.name" :prop="f.name" :label="f.label">
      <template #default="{ row }">
        <span>{{ formatField(row, f.name) }}</span>
        <el-button v-if="!isMaps" size="small" text @click="$emit('edit', row, f)">编辑</el-button>
      </template>
    </el-table-column>
    <el-table-column v-if="!isMaps" label="操作" width="120">
      <template #default="{ row }">
        <el-button size="small" type="danger" @click="$emit('remove', row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
const props = defineProps({
  items: Array,
  fieldMeta: Array,
  isMaps: Boolean,
  loading: Boolean,
  mapAreas: Array
})
const emit = defineEmits(['load-more','edit','remove'])
function handleLoadMore(){
  emit('load-more')
}
function formatField(row, name){
  if(props.isMaps) return row[name]
  if(name==='pls' && props.mapAreas){
    return props.mapAreas[row[name]] || row[name]
  }
  return row[name]
}
</script>
