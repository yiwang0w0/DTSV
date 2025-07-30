<template>
  <div class="page">
    <h2>NPC目录</h2>
    <el-table :data="items" style="width:100%" size="small">
      <el-table-column prop="pid" label="ID" width="80" />
      <el-table-column prop="name" label="名字" />
      <el-table-column prop="spawnStage" label="阶段" width="80" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button text size="small" @click="openEdit(row)">编辑</el-button>
          <el-button text size="small" type="danger" @click="removeItem(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div style="margin-top:6px;text-align:right">
      <el-button size="small" @click="openCreate">添加条目</el-button>
    </div>
    <FormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :fields="fields"
      :form="formData"
      @save="saveDialog"
      @close="dialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta } from '../api'
import FormDialog from '../components/FormDialog.vue'

const items = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const fields = ref([])
const formData = ref({})
const baseItems = ref([])
const equipSlots = [
  { field: 'weaponId', prefix: 'wep', label: '武器模板' },
  { field: 'armorId', prefix: 'arb', label: '身体防具模板' },
  { field: 'headId', prefix: 'arh', label: '头部防具模板' },
  { field: 'armId', prefix: 'ara', label: '腕部防具模板' },
  { field: 'footId', prefix: 'arf', label: '足部防具模板' },
  { field: 'artId', prefix: 'art', label: '饰品模板' },
]
const itemSlots = Array.from({ length: 7 }, (_, i) => ({
  field: `itemId${i}`,
  prefix: `itm${i}`,
  label: `道具${i + 1}模板`,
}))
let editId = ''

onMounted(() => {
  fetchItems()
  fetchFields()
  fetchBaseItems()
})

async function fetchItems() {
  try {
    const { data } = await adminList('npcs', { limit: 1000 })
    items.value = data
  } catch {}
}

async function fetchFields() {
  try {
    const { data } = await adminFieldMeta('npcs')
    fields.value = [
      ...equipSlots.map(e => ({ name: e.field, label: e.label, type: 'select', options: [] })),
      ...itemSlots.map(i => ({ name: i.field, label: i.label, type: 'select', options: [] })),
      ...data,
    ]
    updateItemOptions()
  } catch {}
}

async function fetchBaseItems() {
  try {
    const { data } = await adminList('items', { limit: 1000 })
    baseItems.value = data
    updateItemOptions()
  } catch {}
}

watch(baseItems, updateItemOptions)

function updateItemOptions() {
  const opts = baseItems.value.map(it => ({ label: it.name, value: it.id }))
  ;[...equipSlots, ...itemSlots].forEach(s => {
    const f = fields.value.find(fl => fl.name === s.field)
    if (f) f.options = opts
  })
}

function openCreate() {
  dialogTitle.value = '新建'
  formData.value = { spawnStage: 'start', pls: 0 }
  ;[...equipSlots, ...itemSlots].forEach(s => {
    formData.value[s.field] = baseItems.value[0]?.id || 0
    applyBaseItem(s.prefix, formData.value[s.field])
  })
  editId = ''
  setupWatchers()
  dialogVisible.value = true
}

function openEdit(row) {
  dialogTitle.value = '编辑'
  formData.value = { ...row }
  ;[...equipSlots, ...itemSlots].forEach(s => {
    const found = baseItems.value.find(it => it.name === row[s.prefix])
    formData.value[s.field] = found?.id || 0
  })
  setupWatchers()
  editId = row._id
  dialogVisible.value = true
}

async function saveDialog() {
  try {
    const payload = { ...formData.value }
    ;[...equipSlots, ...itemSlots].forEach(s => {
      delete payload[s.field]
    })
    if (editId) await adminUpdate('npcs', editId, payload)
    else await adminCreate('npcs', payload)
    dialogVisible.value = false
    fetchItems()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function removeItem(row) {
  if (!confirm('确定删除该条目？')) return
  await adminDelete('npcs', row._id)
  fetchItems()
}

function applyBaseItem(prefix, id) {
  const base = baseItems.value.find(i => i.id === id)
  if (!base) return
  formData.value[`${prefix}`] = base.name
  formData.value[`${prefix}k`] = base.kind
  formData.value[`${prefix}e`] = base.effect
  formData.value[`${prefix}s`] = base.dur
  formData.value[`${prefix}sk`] = base.skill
}

let watchers = []
function setupWatchers() {
  watchers.forEach(stop => stop())
  watchers = []
  ;[...equipSlots, ...itemSlots].forEach(s => {
    watchers.push(
      watch(
        () => formData.value[s.field],
        v => applyBaseItem(s.prefix, v)
      )
    )
  })
}
</script>

<style scoped>
@import '../styles/game-tables.css';
.page { padding: 20px; }
</style>
