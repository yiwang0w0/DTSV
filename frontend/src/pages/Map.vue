<template>
  <div class="map-page">
    <h2 class="title">游戏界面</h2>
    <div class="layout">
      <!-- 左侧区域 -->
      <div class="left-panel">
        <PlayerStats v-if="info" :info="info" :injuries="injuries" />
        <EquipmentList v-if="info" :rows="equipRows" @unequip="unequip" />
        <LogPanel :logs="logs" />
      </div>

      <!-- 右侧区域 -->
      <div class="right-panel">
        <!-- 地图状态 + HP/SP -->
        <el-card class="card-section" shadow="hover">
          <el-row :gutter="20">
            <el-col :span="24">
              <strong>位置：</strong>{{ places[info.pls] }}
            </el-col>
            <el-col :span="24" class="status-block">
              <span class="label">生命：</span>
              <el-progress :percentage="hpPercent" :stroke-width="18" status="success" />
              <p class="percent-label">{{ hpLabel }}</p>
            </el-col>
            <el-col :span="24" class="status-block">
              <span class="label">体力：</span>
              <el-progress :percentage="spPercent" :stroke-width="18" status="warning" />
              <p class="percent-label">{{ spLabel }}</p>
            </el-col>
          </el-row>
        </el-card>

        <ActionBar
          v-model="target"
          :places="places"
          @change="onTargetChange"
          @search="doSearch"
          @rest="doRest"
        />

        <SearchDialog
          v-model="replaceVisible"
          :found-item="foundItem"
          :bag-items="bagItems"
          @pick="pickFound"
          @equip="equipFound"
          @replace="doReplace"
          @close="closeReplaceDialog"
        />

        <!-- 背包面板 -->
        <InventoryPanel :enemy="enemy" @attack="doAttack" @escape="doEscape" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import InventoryPanel from '../components/InventoryPanel.vue'
import PlayerStats from '../components/PlayerStats.vue'
import EquipmentList from '../components/EquipmentList.vue'
import LogPanel from '../components/LogPanel.vue'
import ActionBar from '../components/ActionBar.vue'
import SearchDialog from '../components/SearchDialog.vue'
import { move, search, getStatus, getMapAreas, rest, pickItem, pickReplace, pickEquip, unequipItem, attack, escapeBattle } from '../api'
import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import { mapAreas as places } from '../store/map'
import { logs } from '../store/logs'

const router = useRouter()

const target = ref(0)
const foundItem = ref(null)
const replaceVisible = ref(false)
let replaceItemId = null
let programmatic = false
let restTimer = null
const enemy = ref(null)

function checkDeath() {
  if (info.value && info.value.hp <= 0) {
    router.replace('/gameover')
  }
}

function startRestTimer() {
  if (restTimer) return
  restTimer = setInterval(async () => {
    if (!playerId.value) return
    try {
      const { data } = await getStatus(playerId.value)
      info.value = data
      if (!data.restStart) {
        stopRestTimer()
      }
    } catch {}
  }, 1000)
}

function stopRestTimer() {
  if (restTimer) {
    clearInterval(restTimer)
    restTimer = null
  }
}

function setTarget(val) {
  if (target.value !== val) {
    programmatic = true
    target.value = val
  }
}

function onTargetChange() {
  if (programmatic) {
    programmatic = false
  } else {
    doMove()
  }
}

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

const bagItems = computed(() => {
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
      uses
    })
  }
  return res
})

function addLog(message) {
  if (message) logs.value.unshift(message)
}

const hpPercent = computed(() =>
  info.value ? Math.round((info.value.hp / info.value.mhp) * 100) : 0
)
const spPercent = computed(() =>
  info.value ? Math.round((info.value.sp / info.value.msp) * 100) : 0
)
const hpLabel = computed(() =>
  info.value ? `${info.value.hp}/${info.value.mhp}` : '0/0'
)
const spLabel = computed(() =>
  info.value ? `${info.value.sp}/${info.value.msp}` : '0/0'
)
const injuries = computed(() => {
  if (!info.value || !info.value.inf) return '无'
  const map = { b: '胸', h: '头', a: '腕', f: '足' }
  const arr = [...info.value.inf].map(c => map[c]).filter(Boolean)
  return arr.length ? arr.join('、') : '无'
})

const equipRows = computed(() => {
  if (!info.value) return []
  return [
    { slot: '武器', field: 'wep', name: info.value.wep, attr: info.value.wepk, effect: info.value.wep ? info.value.wepe : '', dur: info.value.wep ? info.value.weps : '' },
    { slot: '身体', field: 'arb', name: info.value.arb, attr: info.value.arbk, effect: info.value.arb ? info.value.arbe : '', dur: info.value.arb ? info.value.arbs : '' },
    { slot: '头部', field: 'arh', name: info.value.arh, attr: info.value.arhk, effect: info.value.arh ? info.value.arhe : '', dur: info.value.arh ? info.value.arhs : '' },
    { slot: '手部', field: 'ara', name: info.value.ara, attr: info.value.arak, effect: info.value.ara ? info.value.arae : '', dur: info.value.ara ? info.value.aras : '' },
    { slot: '腿部', field: 'arf', name: info.value.arf, attr: info.value.arfk, effect: info.value.arf ? info.value.arfe : '', dur: info.value.arf ? info.value.arfs : '' },
    { slot: '装饰', field: 'art', name: info.value.art, attr: info.value.artk, effect: info.value.art ? info.value.arte : '', dur: info.value.art ? info.value.arts : '' }
  ]
})

async function fetchStatus() {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    info.value = data
    setTarget(data.pls)
    checkDeath()
    return data
  } catch {
    info.value = null
  }
}

onMounted(() => {
  if (!places.value.length) {
    getMapAreas().then(({ data }) => {
      places.value = data
    }).catch(() => {})
  }
  if (info.value) setTarget(info.value.pls)
  else fetchStatus()
})

onUnmounted(() => {
  stopRestTimer()
})

async function unequip(field) {
  if (!playerId.value) return
  stopRestTimer()
  try {
    const { data } = await unequipItem(playerId.value, field)
    info.value = data.player
    addLog(data.msg)
  } catch (e) {
    alert(e.response?.data?.msg || '卸下失败')
  }
}

async function doMove() {
  if (!playerId.value) return
  stopRestTimer()
  try {
    const { data } = await move(playerId.value, target.value)
    info.value = data.player
    addLog(data.msg)
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '移动失败')
  }
}

async function doSearch() {
  if (!playerId.value) return
  stopRestTimer()
  try {
    const { data } = await search(playerId.value)
    info.value = data.player
    foundItem.value = data.item || null
    enemy.value = data.enemy || null
    addLog(data.log)
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '搜索失败')
  }
}

async function doRest() {
  if (!playerId.value) return
  try {
    const { data } = await rest(playerId.value)
    info.value = data.player
    addLog(data.msg)
    checkDeath()
    if (data.player.restStart) {
      startRestTimer()
    }
  } catch (e) {
    alert(e.response?.data?.msg || '休息失败')
  }
}

async function pickFound() {
  if (!playerId.value || !foundItem.value) return
  stopRestTimer()
  try {
    const { data } = await pickItem(playerId.value, foundItem.value._id)
    info.value = data.player
    addLog(data.msg)
    foundItem.value = null
    checkDeath()
  } catch (e) {
    const msg = e.response?.data?.msg
    if (msg === '物品栏已满') {
      replaceItemId = foundItem.value._id
      replaceVisible.value = true
    } else {
      alert(msg || '拾取失败')
    }
  }
}

async function equipFound() {
  if (!playerId.value || !foundItem.value) return
  stopRestTimer()
  try {
    const { data } = await pickEquip(playerId.value, foundItem.value._id)
    info.value = data.player
    addLog(data.msg)
    foundItem.value = null
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '装备失败')
  }
}

async function doReplace(index) {
  if (!playerId.value || replaceItemId === null) return
  stopRestTimer()
  try {
    const { data } = await pickReplace(playerId.value, replaceItemId, index)
    info.value = data.player
    addLog(data.msg)
    replaceVisible.value = false
    replaceItemId = null
    foundItem.value = null
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '拾取失败')
  }
}

function closeReplaceDialog() {
  replaceVisible.value = false
  replaceItemId = null
  foundItem.value = null
}

async function doAttack() {
  if (!playerId.value || !enemy.value) return
  stopRestTimer()
  try {
    const { data } = await attack(playerId.value, enemy.value.pid)
    info.value = data.player
    addLog(data.log)
    if (data.enemy && data.enemy.hp <= 0) enemy.value = null
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '攻击失败')
  }
}

async function doEscape() {
  if (!playerId.value || !enemy.value) return
  stopRestTimer()
  try {
    const { data } = await escapeBattle(playerId.value, enemy.value.pid)
    info.value = data.player
    addLog(data.log)
    if (data.log.includes('成功逃离')) enemy.value = null
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '逃跑失败')
  }
}
</script>

<style scoped>
.map-page {
  padding: 30px 20px;
  max-width: 960px;
  margin: 0 auto;
}

.layout {
  display: flex;
  gap: 20px;
}

.left-panel,
.right-panel {
  flex: 1;
}

.title {
  text-align: center;
  font-size: 24px;
  margin-bottom: 20px;
}

.card-section {
  margin-bottom: 20px;
}

.status-block {
  margin-top: 12px;
}

.percent-label {
  color: #303133;
  font-size: 14px;
  margin-top: 4px;
}

.label {
  font-weight: bold;
  margin-right: 8px;
}
</style>
