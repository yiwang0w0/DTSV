<template>
  <div>
    <div v-if="info">
      <h4 style="margin-top:10px">物品栏</h4>
      <el-table :data="items" style="width:100%">
        <el-table-column prop="name" label="物品" />
        <el-table-column prop="type" label="类型" width="90" />
        <el-table-column prop="effect" label="效果" width="70" />
        <el-table-column prop="uses" label="耐久" width="60" />
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button size="small" @click="equip(scope.$index)" :disabled="scope.row.disableEquip">装备</el-button>
            <el-button size="small" @click="useIt(scope.$index)" :disabled="scope.row.disableUse">使用</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="enemy" style="margin-top:10px; text-align:center;">
        <p>遭遇 {{ enemy.type > 0 ? 'NPC' : '玩家' }}【{{ enemy.name }}】</p>
        <el-button size="small" type="danger" @click="emit('attack')">攻击</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  enemy: Object
})
const emit = defineEmits(['attack'])
import { playerInfo as info } from '../store/player'
import { playerId } from '../store/user'
import { equipItem, useItem } from '../api'

function getType(kind) {
  if (!kind) return ''
  if (kind.startsWith('HB')) return '命体恢复'
  if (kind.startsWith('HS')) return '体力恢复'
  if (kind.startsWith('HH') || kind.startsWith('HR')) return '生命恢复'
  if (kind.startsWith('W')) return '武器'
  if (kind.startsWith('DB')) return '身体装备'
  if (kind.startsWith('DH')) return '头部装备'
  if (kind.startsWith('DA')) return '手部装备'
  if (kind.startsWith('DF')) return '腿部装备'
  if (kind.startsWith('A')) return '饰品'
  return '其他'
}

function isEquip(kind) {
  return /^(W|DB|DH|DA|DF|A)/.test(kind)
}

const items = computed(() => {
  const res = []
  if (!info.value) return res
  for (let i = 0; i < 5; i++) {
    const name = info.value[`itm${i}`] || ''
    const kind = info.value[`itmk${i}`] || ''
    const effect = name ? info.value[`itme${i}`] : ''
    const uses = name ? info.value[`itms${i}`] : ''
    res.push({
      name,
      type: getType(kind),
      effect,
      uses,
      disableEquip: !name || !isEquip(kind),
      disableUse: !name || isEquip(kind)
    })
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
