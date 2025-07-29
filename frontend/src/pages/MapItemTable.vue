<template>
  <div class="page">
    <h3>刷新表 - {{ areaName(area) }}</h3>
    <el-button size="small" @click="goBack" style="margin-bottom:10px">返回</el-button>
    <el-tabs v-model="tab">
      <el-tab-pane v-for="s in stageOptions" :key="s.value" :label="s.label" :name="s.value">
        <el-table :data="filterStage(category?.items || [], s.value)" size="small" style="width: 100%">
          <el-table-column prop="itemId" label="物品">
            <template #default="{ row }">{{ itemName(row.itemId) }}</template>
          </el-table-column>
          <el-table-column prop="count" label="数量" width="60" />
          <el-table-column prop="itmk" label="种类" width="80">
            <template #default="{ row }">{{ kindText(row.itmk) }}</template>
          </el-table-column>
          <el-table-column prop="itme" label="效果值" width="60" />
          <el-table-column prop="itms" label="耐久/数量" width="60" />
          <el-table-column prop="itmsk" label="属性" width="80" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button text size="small" @click="openEditItem(row)">编辑</el-button>
              <el-button text size="small" type="danger" @click="removeItem(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div style="margin-top: 6px; text-align: right">
          <el-button size="small" @click="openCreateItem(s.value)">添加条目</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
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
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminList, adminUpdate, getMapAreas } from '../api'
import { mapAreas } from '../store/map'
import { itemTypeText } from '../constants/enums'
import FormDialog from '../components/FormDialog.vue'

const props = defineProps({ area: { type: Number, default: 0 } })
const route = useRoute()
const router = useRouter()
const area = computed(() => props.area || Number(route.query.area) || 0)

const category = ref(null)
const items = ref([])
const tab = ref('start')
const stageOptions = [
  { label: 'start', value: 'start' },
  { label: 'ban2', value: 'ban2' },
  { label: 'ban4', value: 'ban4' },
]

const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogFields = ref([])
const formData = ref({})
let editIndex = -1

onMounted(() => {
  fetchCategory()
  fetchItems()
  fetchAreas()
})

async function fetchCategory() {
  try {
    const { data } = await adminList('itemcategories', { area: area.value, limit: 1 })
    category.value = data[0] || null
    if (!tab.value) tab.value = 'start'
  } catch {}
}

async function fetchItems() {
  try {
    const { data } = await adminList('items', { limit: 1000 })
    items.value = data
  } catch {}
}

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

function itemName(id) {
  const it = items.value.find(i => i.id === id)
  return it ? it.name : id
}

function kindText(k) {
  return itemTypeText[k] || k
}

function filterStage(list, stage) {
  return (list || []).filter(it => (it.stage || 'start') === stage)
}

function openCreateItem(stage) {
  dialogTitle.value = '添加条目'
  dialogFields.value = entryFields
  formData.value = { itemId: items.value[0]?.id || 0, count: 1, stage }
  editIndex = -1
  dialogVisible.value = true
}

function openEditItem(row) {
  dialogTitle.value = '编辑条目'
  dialogFields.value = entryFields
  formData.value = { ...row }
  editIndex = category.value.items.indexOf(row)
  dialogVisible.value = true
}

const entryFields = [
  { name: 'itemId', label: '物品', type: 'select', options: [] },
  { name: 'count', label: '数量', type: 'number' },
  { name: 'stage', label: '阶段', type: 'select', options: ['start','ban2','ban4'] },
  { name: 'itmk', label: '种类', type: 'text' },
  { name: 'itme', label: '效果值', type: 'number' },
  { name: 'itms', label: '耐久/数量', type: 'text' },
  { name: 'itmsk', label: '属性', type: 'text' },
]

function updateOptions() {
  entryFields[0].options = items.value.map(it => ({ label: it.name, value: it.id }))
}

updateOptions()

async function saveDialog() {
  if (!category.value) return
  if (editIndex >= 0) category.value.items.splice(editIndex, 1, { ...formData.value })
  else category.value.items.push({ ...formData.value })
  await adminUpdate('itemcategories', category.value._id, { items: category.value.items })
  dialogVisible.value = false
  fetchCategory()
}

async function removeItem(row) {
  if (!category.value) return
  category.value.items = category.value.items.filter(i => i !== row)
  await adminUpdate('itemcategories', category.value._id, { items: category.value.items })
  fetchCategory()
}

function goBack() {
  router.push('/admin/mapresources')
}
</script>

<style scoped>
.page {
  padding: 20px;
}
</style>
