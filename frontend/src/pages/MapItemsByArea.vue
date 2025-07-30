<template>
  <div class="page">
    <h3>地图物品 - {{ areaName(area) }}</h3>
    <el-button size="small" @click="goBack" style="margin-bottom:10px">返回</el-button>
    <el-table :data="items" style="width:100%" size="small">
      <el-table-column prop="stage" label="阶段" width="80" />
      <el-table-column prop="itm" label="物品" />
      <el-table-column prop="itmk" label="种类" width="80">
        <template #default="{ row }">{{ kindText(row.itmk) }}</template>
      </el-table-column>
      <el-table-column prop="itme" label="效果值" width="60" />
      <el-table-column prop="itms" label="耐久/数量" width="80" />
      <el-table-column prop="itmsk" label="属性" width="80" />
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
      :fields="dialogFields"
      :form="formData"
      @save="saveDialog"
      @close="dialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta, getMapAreas } from '../api'
import { mapAreas } from '../store/map'
import { itemTypeText } from '../constants/enums'
import FormDialog from '../components/FormDialog.vue'

const route = useRoute()
const router = useRouter()
const area = Number(route.query.area) || 0

const items = ref([])
const baseItems = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogFields = ref([])
const formData = ref({})
let editId = ''

onMounted(() => {
  fetchItems()
  fetchFields()
  fetchAreas()
  fetchBaseItems()
})

async function fetchItems() {
  try {
    const { data } = await adminList('mapitems', { pls: area, limit: 1000 })
    items.value = data
  } catch {}
}

async function fetchBaseItems() {
  try {
    const { data } = await adminList('items', { limit: 1000 })
    baseItems.value = data
  } catch {}
}
async function fetchFields() {
  try {
    const { data } = await adminFieldMeta('mapitems')
    dialogFields.value = data.filter(f => f.name !== 'pls' && f.name !== 'stage')
    dialogFields.value.unshift({ name: 'itemId', label: '物品', type: 'select', options: [] })
  } catch {}
}

function updateItemOptions() {
  const field = dialogFields.value.find(f => f.name === 'itemId')
  if (field) {
    field.options = baseItems.value.map(it => ({ label: it.name, value: it.id }))
  }
}

watch(baseItems, updateItemOptions, { immediate: true })

async function fetchAreas() {
  if (mapAreas.value.length) return
  try {
    const { data } = await getMapAreas()
    mapAreas.value = data
  } catch {}
}

function areaName(pid) {
  const a = mapAreas.value.find(m => m.pid === pid)
  return a ? a.name : pid
}

function kindText(k) {
  return itemTypeText[k] || k
}

function openCreate() {
  dialogTitle.value = '新建'
  formData.value = {
    itemId: baseItems.value[0]?.id || 0,
    itms: '1',
    itmsk: ''
  }
  editId = ''
  dialogVisible.value = true
}

function openEdit(row) {
  dialogTitle.value = '编辑'
  const found = baseItems.value.find(i => i.name === row.itm)
  formData.value = { itemId: found?.id || 0, ...row }
  editId = row._id
  dialogVisible.value = true
}

function applyBaseItem() {
  const base = baseItems.value.find(i => i.id === formData.value.itemId)
  if (base) {
    formData.value.itm = base.name
    formData.value.itmk = base.kind
    formData.value.itme = base.effect
    formData.value.itmsk ||= base.skill
    formData.value.itms ||= base.dur
  }
}

watch(() => formData.value.itemId, applyBaseItem, { immediate: true })

async function saveDialog() {
  const base = baseItems.value.find(i => i.id === formData.value.itemId)
  if (base) {
    formData.value.itm = base.name
    if (!formData.value.itmk) formData.value.itmk = base.kind
    if (formData.value.itme === undefined || formData.value.itme === null) {
      formData.value.itme = base.effect
    }
    if (!formData.value.itms) formData.value.itms = base.dur
    if (!formData.value.itmsk) formData.value.itmsk = base.skill
  }
  formData.value.pls = area
  formData.value.stage = 'start'
  if (editId) await adminUpdate('mapitems', editId, formData.value)
  else await adminCreate('mapitems', formData.value)
  dialogVisible.value = false
  fetchItems()
}

async function removeItem(row) {
  if (!confirm('确定删除该条目？')) return
  await adminDelete('mapitems', row._id)
  fetchItems()
}

function goBack() {
  router.push('/admin/mapresources')
}
</script>

<style scoped>
@import '../styles/game-tables.css';
.page { padding: 20px; }
</style>

