<template>
  <div class="map-page">
    <h2 class="title">游戏界面</h2>
    <div class="layout">
      <!-- 左侧区域 -->
      <div class="left-panel">
        <!-- 玩家数值区（无标题） -->
        <el-card class="card-section card-no-title" v-if="info">
          <p>玩家名：{{ info.name }}</p>
          <p>攻击力：{{ info.att }}</p>
          <p>防御力：{{ info.def }}</p>
          <p>等级：{{ info.lvl }}</p>
          <p>经验值：{{ info.exp }}</p>
          <p>金钱：{{ info.money }}</p>
          <p>熟练度：殴{{ info.wp }} 斩{{ info.wk }} 射{{ info.wg }} 投{{ info.wc }} 爆{{ info.wd }} 灵{{ info.wf }}</p>
          <p>受伤：{{ injuries }}</p>
        </el-card>

        <!-- 已装备列表（无标题） -->
        <el-card class="card-section card-no-title" v-if="info">
          <el-table :data="equipRows" size="small" style="width: 100%">
            <el-table-column prop="slot" label="装备种类" width="80" />
            <el-table-column prop="name" label="装备名称" />
            <el-table-column prop="attr" label="属性" width="80" />
            <el-table-column prop="effect" label="效果" width="80" />
            <el-table-column prop="dur" label="耐久" width="80" />
            <el-table-column label="操作" width="80">
              <template #default="scope">
                <el-button size="small" @click="unequip(scope.row.field)" :disabled="!scope.row.name">卸下</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 历史日志 -->
        <el-card class="log-panel" shadow="never" v-if="logs.length">
          <div v-for="(l, i) in logs" :key="i" v-html="l" class="log-item" />
        </el-card>
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

        <!-- 行动按钮区 -->
        <div class="action-bar">
          <el-select
            v-model="target"
            placeholder="选择地点"
            style="width: 180px"
            @change="onTargetChange"
          >
            <el-option v-for="(n, i) in places" :key="i" :label="n" :value="i" />
          </el-select>
          <el-button type="primary" @click="doMove">移动</el-button>
          <el-button @click="doSearch">搜索</el-button>
          <el-button @click="doRest">休息</el-button>
        </div>

        <!-- 搜索结果 -->
        <div v-if="foundItem" class="card-section search-result">
          <p>发现 {{ foundItem.itm }}</p>
          <el-button size="small" @click="pickFound">拾取</el-button>
          <el-button size="small" v-if="isEquip(foundItem.itmk)" @click="equipFound">装备</el-button>
        </div>

        <!-- 背包面板 -->
        <InventoryPanel />

        <el-dialog
          v-model="replaceVisible"
          title="选择替换物品"
          width="400px"
          @close="closeReplaceDialog"
        >
          <el-table :data="bagItems" style="width:100%">
            <el-table-column prop="name" label="物品" />
            <el-table-column prop="type" label="类型" width="90" />
            <el-table-column prop="effect" label="效果" width="70" />
            <el-table-column prop="uses" label="耐久" width="60" />
            <el-table-column label="操作" width="80">
              <template #default="scope">
                <el-button size="small" @click="doReplace(scope.$index)">替换</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-dialog>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import InventoryPanel from '../components/InventoryPanel.vue'
import { move, search, getStatus, getMapAreas, rest, pickItem, pickReplace, pickEquip, unequipItem } from '../api'
import { playerId } from '../store/user'
import { playerInfo as info } from '../store/player'
import { mapAreas as places } from '../store/map'
import { logs } from '../store/logs'

const target = ref(0)
const foundItem = ref(null)
const replaceVisible = ref(false)
let replaceItemId = null
let programmatic = false

function setTarget(val) {
  programmatic = true
  target.value = val
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

async function unequip(field) {
  if (!playerId.value) return
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
  try {
    const { data } = await move(playerId.value, target.value)
    info.value = data.player
    addLog(data.msg)
  } catch (e) {
    alert(e.response?.data?.msg || '移动失败')
  }
}

async function doSearch() {
  if (!playerId.value) return
  try {
    const { data } = await search(playerId.value)
    info.value = data.player
    foundItem.value = data.item || null
    addLog(data.log)
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
  } catch (e) {
    alert(e.response?.data?.msg || '休息失败')
  }
}

async function pickFound() {
  if (!playerId.value || !foundItem.value) return
  try {
    const { data } = await pickItem(playerId.value, foundItem.value._id)
    info.value = data.player
    addLog(data.msg)
    foundItem.value = null
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
  try {
    const { data } = await pickEquip(playerId.value, foundItem.value._id)
    info.value = data.player
    addLog(data.msg)
    foundItem.value = null
  } catch (e) {
    alert(e.response?.data?.msg || '装备失败')
  }
}

async function doReplace(index) {
  if (!playerId.value || replaceItemId === null) return
  try {
    const { data } = await pickReplace(playerId.value, replaceItemId, index)
    info.value = data.player
    addLog(data.msg)
    replaceVisible.value = false
    replaceItemId = null
    foundItem.value = null
  } catch (e) {
    alert(e.response?.data?.msg || '拾取失败')
  }
}

function closeReplaceDialog() {
  replaceVisible.value = false
  replaceItemId = null
  foundItem.value = null
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

.card-no-title >>> .el-card__header {
  display: none;
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

.action-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin: 16px 0;
}

.log-panel {
  max-height: 200px;
  overflow-y: auto;
  background: #f9f9f9;
  padding: 10px;
  margin-bottom: 20px;
}

.log-item {
  padding: 4px 0;
  border-bottom: 1px solid #eee;
}

.search-result {
  background: #fdfdfd;
}
</style>
