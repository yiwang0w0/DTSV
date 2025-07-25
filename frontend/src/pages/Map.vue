<template>
  <div class="map-page">
    <h2 class="title">游戏界面</h2>
    <div class="layout">
      <!-- 左侧区域 -->
      <div class="left-panel">
        <PlayerStats v-if="info" :info="info" :injuries="injuries" />
        <BattlePanel v-if="enemy" :player="info" :enemy="enemy" :loot="lootItems" @attack="doAttack" @loot="doLoot" />
        <EquipmentList v-if="info" :rows="equipRows" @unequip="unequip" @drop="dropEquipItem" />
        <ChatPanel :messages="chatList" @send="sendChatMsg" />
      </div>

      <!-- 右侧区域 -->
      <div class="right-panel">
        <!-- 地图状态 + HP/SP -->
        <el-card class="card-section" shadow="hover">
          <el-row :gutter="20">
            <el-col :span="24">
              <strong>位置：</strong>{{ areaName(info.pls) }}
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
        <InventoryPanel :latest-log="latestLog" />
        <AreaButtons :areas="places" @move="doMoveTo" />
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
import BattlePanel from '../components/BattlePanel.vue'
import ChatPanel from '../components/ChatPanel.vue'
import ActionBar from '../components/ActionBar.vue'
import AreaButtons from '../components/AreaButtons.vue'
import SearchDialog from '../components/SearchDialog.vue'
import { move, search, getStatus, getMapAreas, rest, pickItem, pickReplace, pickEquip, unequipItem, dropEquip, attack, lootCorpse, getChats, sendChat } from '../api'
import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import { mapAreas as places } from '../store/map'
import { logs } from '../store/logs'
import { chats as chatList, addChat } from '../store/chat'
import { itemTypeText } from '../constants/enums'

const router = useRouter()

const foundItem = ref(null)
const replaceVisible = ref(false)
let replaceItemId = null
let restTimer = null
let statusTimer = null
let chatTimer = null
const lastCid = ref(0)
const enemy = ref(null)
const lootItems = ref(null)

async function refreshMapAreas() {
  try {
    const { data } = await getMapAreas()
    places.value = data
  } catch {}
}

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

function areaName(pid) {
  const area = places.value.find(a => a.pid === pid)
  return area ? area.name : ''
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

const latestLog = computed(() => logs.value[0] || '')

function addLog(message) {
  if (message) {
    logs.value.unshift(message)
  }
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
    { slot: '武器', field: 'wep', name: info.value.wep, attr: itemTypeText[info.value.wepk] || info.value.wepk, effect: info.value.wep ? info.value.wepe : '', dur: info.value.wep ? info.value.weps : '' },
    { slot: '身体', field: 'arb', name: info.value.arb, attr: itemTypeText[info.value.arbk] || info.value.arbk, effect: info.value.arb ? info.value.arbe : '', dur: info.value.arb ? info.value.arbs : '' },
    { slot: '头部', field: 'arh', name: info.value.arh, attr: itemTypeText[info.value.arhk] || info.value.arhk, effect: info.value.arh ? info.value.arhe : '', dur: info.value.arh ? info.value.arhs : '' },
    { slot: '手部', field: 'ara', name: info.value.ara, attr: itemTypeText[info.value.arak] || info.value.arak, effect: info.value.ara ? info.value.arae : '', dur: info.value.ara ? info.value.aras : '' },
    { slot: '腿部', field: 'arf', name: info.value.arf, attr: itemTypeText[info.value.arfk] || info.value.arfk, effect: info.value.arf ? info.value.arfe : '', dur: info.value.arf ? info.value.arfs : '' },
    { slot: '装饰', field: 'art', name: info.value.art, attr: itemTypeText[info.value.artk] || info.value.artk, effect: info.value.art ? info.value.arte : '', dur: info.value.art ? info.value.arts : '' }
  ]
})

async function fetchStatus() {
  if (!playerId.value) return
  try {
    const { data } = await getStatus(playerId.value)
    await refreshMapAreas()
    info.value = data
    checkDeath()
    return data
  } catch (e) {
    if (e.response?.data?.msg === '你已经死亡') {
      try {
        const res = await getDeadStatus(playerId.value)
        info.value = res.data
        router.replace('/gameover')
        return
      } catch {}
    }
    info.value = null
  }
}

async function fetchChats() {
  if (!playerId.value) return
  try {
    const { data } = await getChats({ lastcid: lastCid.value })
    if (data.chats && data.chats.length) {
      data.chats.forEach(c => addChat(c))
      lastCid.value = data.lastcid
    }
  } catch {}
}

onMounted(() => {
  refreshMapAreas()
  if (!info.value) fetchStatus()
  statusTimer = setInterval(fetchStatus, 5000)
  fetchChats()
  chatTimer = setInterval(fetchChats, 5000)
})

onUnmounted(() => {
  stopRestTimer()
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  if (chatTimer) {
    clearInterval(chatTimer)
    chatTimer = null
  }
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

async function dropEquipItem(field) {
  if (!playerId.value) return
  stopRestTimer()
  try {
    const { data } = await dropEquip(playerId.value, field)
    info.value = data.player
    addLog(data.msg)
  } catch (e) {
    alert(e.response?.data?.msg || '丢弃失败')
  }
}

async function doMoveTo(pid) {
  if (!playerId.value) return
  stopRestTimer()
  try {
    const { data } = await move(playerId.value, pid)
    info.value = data.player
    await refreshMapAreas()
    addLog(data.log)
    foundItem.value = data.item || null
    enemy.value = data.enemy || null
    lootItems.value = null
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
    lootItems.value = null
    await refreshMapAreas()
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
    await refreshMapAreas()
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
    await refreshMapAreas()
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
    await refreshMapAreas()
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
    await refreshMapAreas()
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
    if (data.loot) {
      lootItems.value = data.loot
    }
    if (data.enemy && data.enemy.hp > 0) {
      enemy.value = data.enemy
    } else {
      enemy.value = null
    }
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '攻击失败')
  }
}

async function doLoot(slot) {
  if (!playerId.value || !enemy.value) return
  try {
    const { data } = await lootCorpse(playerId.value, enemy.value.pid, slot)
    info.value = data.player
    addLog(data.msg)
    lootItems.value = null
    enemy.value = null
    await refreshMapAreas()
    checkDeath()
  } catch (e) {
    alert(e.response?.data?.msg || '拾取失败')
  }
}

function sendChatMsg(text) {
  if (!playerId.value) return
  sendChat({ pid: playerId.value, msg: text }).then(({ data }) => {
    addChat(data)
    lastCid.value = data.cid
  }).catch(e => {
    alert(e.response?.data?.msg || '发送失败')
  })
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
