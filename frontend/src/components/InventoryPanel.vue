<template>
  <div>
    <div v-if="info">
      <h4>装备</h4>
      <ul>
        <li>武器：{{ info.wep || '无' }}</li>
        <li>防具：{{ info.arb || '无' }}</li>
      </ul>
      <h4 style="margin-top:10px">物品栏</h4>
      <el-table :data="items" style="width:100%">
        <el-table-column prop="name" label="物品" />
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button size="small" @click="equip(scope.$index)" :disabled="!scope.row.name">装备</el-button>
            <el-button size="small" @click="useIt(scope.$index)" :disabled="!scope.row.name">使用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { playerInfo as info } from '../store/player'
import { playerId } from '../store/user'
import { equipItem, useItem } from '../api'

const items = computed(() => {
  const res = []
  if (!info.value) return res
  for (let i = 0; i < 5; i++) {
    res.push({ name: info.value[`itm${i}`] || '' })
  }
  return res
})

function equip(index) {
  if (!playerId.value) return
  equipItem(playerId.value, index).then(({ data }) => {
    info.value = data.player
  }).catch(e => {
    const msg = e.response?.data?.msg
    alert(msg || '装备失败')
  })
}

function useIt(index) {
  if (!playerId.value) return
  useItem(playerId.value, index).then(({ data }) => {
    info.value = data.player
  }).catch(e => {
    const msg = e.response?.data?.msg
    alert(msg || '使用失败')
  })
}
</script>
