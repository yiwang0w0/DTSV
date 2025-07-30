<template>
  <div class="page">
    <h3>商店物品 - {{ areaName(area) }}</h3>
    <el-button size="small" @click="goBack" style="margin-bottom:10px">返回</el-button>
    <el-table :data="items" style="width:100%" size="small">
      <el-table-column prop="sid" label="物品ID" width="80" />
      <el-table-column prop="item" label="名称" />
      <el-table-column prop="price" label="价格" width="80" />
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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta, getMapAreas } from '../api'
import { mapAreas } from '../store/map'
import FormDialog from '../components/FormDialog.vue'

const route = useRoute()
const router = useRouter()
const area = Number(route.query.area) || 0

const items = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogFields = ref([])
const formData = ref({})
let editId = ''

onMounted(() => {
  fetchItems()
  fetchFields()
  fetchAreas()
})

async function fetchItems() {
  try {
    const { data } = await adminList('shopitems', { area, limit: 1000 })
    items.value = data
  } catch {}
}

async function fetchFields() {
  try {
    const { data } = await adminFieldMeta('shopitems')
    dialogFields.value = data.filter(f => f.name !== 'area')
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

function openCreate() {
  dialogTitle.value = '新建'
  formData.value = {}
  editId = ''
  dialogVisible.value = true
}

function openEdit(row) {
  dialogTitle.value = '编辑'
  formData.value = { ...row }
  editId = row._id
  dialogVisible.value = true
}

async function saveDialog() {
  formData.value.area = area
  if (editId) await adminUpdate('shopitems', editId, formData.value)
  else await adminCreate('shopitems', formData.value)
  dialogVisible.value = false
  fetchItems()
}

async function removeItem(row) {
  if (!confirm('确定删除该条目？')) return
  await adminDelete('shopitems', row._id)
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

