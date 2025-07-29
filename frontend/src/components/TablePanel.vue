<template>
  <el-table
    :data="items"
    style="margin-top: 20px"
    row-key="_id"
    v-infinite-scroll="handleLoadMore"
    :infinite-scroll-distance="10"
    :infinite-scroll-disabled="loading || disableLoad"
    v-loading="loading"
  >
    <el-table-column prop="_id" label="ID" width="230" />
    <el-table-column v-for="f in fieldMeta" :key="f.name" :prop="f.name" :label="f.label">
      <template #default="{ row }">
        <span>{{ formatField(row, f.name) }}</span>
        <el-button v-if="!isMaps" size="small" text @click="$emit('edit', row, f)">编辑</el-button>
      </template>
    </el-table-column>
    <el-table-column v-if="isMapAreas" label="禁区操作" width="140">
      <template #default="{ row }">
        <el-button v-if="row.danger" size="small" type="warning" @click="$emit('close', row)">关闭</el-button>
        <el-button v-else size="small" type="primary" @click="$emit('open', row)">开启</el-button>
      </template>
    </el-table-column>
    <el-table-column v-if="!isMaps && !isMapAreas" label="操作" width="120">
      <template #default="{ row }">
        <el-button size="small" type="danger" @click="$emit('remove', row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { stateInfo } from '../constants/death'
import { gameStateText, chatTypeText, itemTypeText, trapTypeText, npcTypeText } from '../constants/enums'
const props = defineProps({
  items: Array,
  fieldMeta: Array,
  isMaps: Boolean,
  isMapAreas: Boolean,
  loading: Boolean,
  mapAreas: Array,
  disableLoad: Boolean
})
const emit = defineEmits(['load-more','edit','remove','open','close'])
function handleLoadMore(){
  emit('load-more')
}
function formatField(row, name){
  if(props.isMaps) return row[name]
  if((name==='pls' || name==='area') && props.mapAreas){
    const a = props.mapAreas.find(m => m.pid === row[name])
    return a ? a.name : row[name]
  }
  if(name==='state'){
    return stateInfo[row[name]] || row[name]
  }
  if(name==='gamestate'){
    return gameStateText[row[name]] || row[name]
  }
  if(name==='type'){
    return chatTypeText[row[name]] || npcTypeText[row[name]] || row[name]
  }
  if(name==='itmk'){
    return trapTypeText[row[name]] || itemTypeText[row[name]] || row[name]
  }
  if(name==='danger'){
    return row[name] ? '禁区' : '安全'
  }
  return row[name]
}
</script>
