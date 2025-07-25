<template>
  <div class="page">
    <h2>物品刷新管理</h2>
    <el-button type="primary" size="small" @click="openCreateCategory">新建类别</el-button>
    <el-row :gutter="20" style="margin-top:10px">
      <el-col v-for="cat in categories" :key="cat._id" :span="8">
        <el-card shadow="hover">
          <template #header>
            <span>{{ cat.name }}</span>
            <div style="float:right">
              <el-button text size="small" @click="openEditCategory(cat)">编辑</el-button>
              <el-button text size="small" type="danger" @click="removeCategory(cat)">删除</el-button>
            </div>
          </template>
          <el-tabs v-model="tabs[cat._id]">
            <el-tab-pane v-for="s in stageOptions" :key="s.value" :label="s.label" :name="s.value">
              <el-table :data="filterStage(cat.items, s.value)" size="small" style="width:100%">
                <el-table-column prop="itemId" label="物品">
                  <template #default="{ row }">{{ itemName(row.itemId) }}</template>
                </el-table-column>
                <el-table-column prop="pls" label="区域" width="70" />
                <el-table-column prop="count" label="数量" width="60" />
                <el-table-column prop="itmk" label="itmk" width="80" />
                <el-table-column prop="itme" label="itme" width="60" />
                <el-table-column prop="itms" label="itms" width="60" />
                <el-table-column prop="itmsk" label="itmsk" width="80" />
                <el-table-column label="操作" width="120">
                  <template #default="{ row }">
                    <el-button text size="small" @click="openEditItem(cat, row)">编辑</el-button>
                    <el-button text size="small" type="danger" @click="removeItem(cat, row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div style="margin-top:6px;text-align:right">
                <el-button size="small" @click="openCreateItem(cat, s.value)">添加条目</el-button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>
    <FormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :fields="dialogFields"
      :form="formData"
      @save="saveDialog"
      @close="dialogVisible=false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watchEffect } from 'vue'
import { adminList, adminCreate, adminUpdate, adminDelete } from '../api'
import FormDialog from '../components/FormDialog.vue'

const categories = ref([])
const items = ref([])
const tabs = reactive({})
const stageOptions = [
  { label: 'start', value: 'start' },
  { label: 'ban2', value: 'ban2' },
  { label: 'ban4', value: 'ban4' },
]

const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogFields = ref([])
const formData = ref({})
let editCategoryId = ''
let editItemIndex = -1

onMounted(() => {
  fetchCategories()
  fetchItems()
})

async function fetchCategories() {
  try {
    const { data } = await adminList('itemcategories', { limit: 1000 })
    categories.value = data
    data.forEach(c => { if (!tabs[c._id]) tabs[c._id] = 'start' })
  } catch {}
}

async function fetchItems() {
  try {
    const { data } = await adminList('items', { skip: 0, limit: 1000 })
    items.value = data
  } catch {}
}

function itemName(id) {
  const it = items.value.find(i => i.id === id)
  return it ? it.name : id
}

function filterStage(list, stage) {
  return (list || []).filter(it => (it.stage || 'start') === stage)
}

function openCreateCategory() {
  dialogTitle.value = '新建类别'
  dialogFields.value = [
    { name: 'name', label: '类别名称', type: 'text' },
    { name: 'type', label: '类别类型', type: 'select', options: ['mapitem', 'maptrap'] },
  ]
  formData.value = { name: '', type: 'mapitem' }
  editCategoryId = ''
  dialogVisible.value = true
}

function openEditCategory(c) {
  dialogTitle.value = '编辑类别'
  dialogFields.value = [
    { name: 'name', label: '类别名称', type: 'text' },
    { name: 'type', label: '类别类型', type: 'select', options: ['mapitem', 'maptrap'] },
  ]
  formData.value = { name: c.name, type: c.type }
  editCategoryId = c._id
  dialogVisible.value = true
}

function openCreateItem(cat, stage) {
  dialogTitle.value = '添加条目'
  dialogFields.value = entryFields
  formData.value = { itemId: items.value[0]?.id || 0, pls: 0, count: 1, stage }
  editCategoryId = cat._id
  editItemIndex = -1
  dialogVisible.value = true
}

function openEditItem(cat, row) {
  dialogTitle.value = '编辑条目'
  dialogFields.value = entryFields
  formData.value = { ...row }
  editCategoryId = cat._id
  editItemIndex = cat.items.indexOf(row)
  dialogVisible.value = true
}

const entryFields = [
  { name: 'itemId', label: '物品', type: 'select', options: [] },
  { name: 'pls', label: '区域', type: 'number' },
  { name: 'count', label: '数量', type: 'number' },
  { name: 'stage', label: '阶段', type: 'select', options: ['start', 'ban2', 'ban4'] },
  { name: 'itmk', label: 'itmk', type: 'text' },
  { name: 'itme', label: 'itme', type: 'number' },
  { name: 'itms', label: 'itms', type: 'text' },
  { name: 'itmsk', label: 'itmsk', type: 'text' },
]

function updateEntryOptions() {
  entryFields[0].options = items.value.map(it => ({ label: it.name, value: it.id }))
}

watchEffect(updateEntryOptions)

async function saveDialog() {
  if (dialogFields.value[0].name === 'itemId') {
    await saveItem()
  } else {
    await saveCategory()
  }
}

async function saveCategory() {
  if (editCategoryId) await adminUpdate('itemcategories', editCategoryId, formData.value)
  else await adminCreate('itemcategories', { ...formData.value, items: [] })
  dialogVisible.value = false
  fetchCategories()
}

async function saveItem() {
  const cat = categories.value.find(c => c._id === editCategoryId)
  if (!cat) return
  if (editItemIndex >= 0) cat.items.splice(editItemIndex, 1, { ...formData.value })
  else cat.items.push({ ...formData.value })
  await adminUpdate('itemcategories', cat._id, { items: cat.items })
  dialogVisible.value = false
  fetchCategories()
}

async function removeCategory(cat) {
  if (!confirm('确定删除该类别？')) return
  await adminDelete('itemcategories', cat._id)
  fetchCategories()
}

async function removeItem(cat, row) {
  if (!confirm('确定删除该条目？')) return
  cat.items = cat.items.filter(i => i !== row)
  await adminUpdate('itemcategories', cat._id, { items: cat.items })
  fetchCategories()
}
</script>

<style scoped>
.page {
  padding: 20px;
}
</style>
