<template>
  <div class="page">
    <h2>物品类别管理</h2>
    <el-button type="primary" size="small" @click="openCreate">新建</el-button>
    <el-table :data="categories" style="margin-top:10px" @row-click="openEdit">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" type="danger" @click.stop="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <FormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :fields="fields"
      :form="formData"
      @save="save"
      @close="dialogVisible=false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminList, adminCreate, adminUpdate, adminDelete } from '../api'
import FormDialog from '../components/FormDialog.vue'

const categories = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const formData = ref({})
const editId = ref('')

const fields = [
  { name: 'name', label: '名称', type: 'text' },
  {
    name: 'type',
    label: '类型',
    type: 'select',
    options: [
      { label: '地图物品', value: 'mapitem' },
      { label: '地图陷阱', value: 'maptrap' }
    ]
  },
  { name: 'items', label: '条目列表(JSON)', type: 'textarea' }
]

onMounted(fetchCategories)

async function fetchCategories() {
  try {
    const { data } = await adminList('itemcategories', { skip: 0, limit: 1000 })
    categories.value = data
  } catch (e) {
    alert(e.response?.data?.msg || '加载失败')
  }
}

function openEdit(row) {
  editId.value = row._id
  dialogTitle.value = '编辑 ' + row.name
  formData.value = { ...row, items: JSON.stringify(row.items, null, 2) }
  dialogVisible.value = true
}

function openCreate() {
  dialogTitle.value = '新建'
  formData.value = { name: '', type: 'mapitem', items: '[]' }
  editId.value = ''
  dialogVisible.value = true
}

async function save() {
  try {
    const payload = { ...formData.value }
    try {
      payload.items = JSON.parse(payload.items || '[]')
    } catch {
      alert('items 字段必须是合法 JSON')
      return
    }
    if (editId.value) {
      await adminUpdate('itemcategories', editId.value, payload)
    } else {
      await adminCreate('itemcategories', payload)
    }
    dialogVisible.value = false
    fetchCategories()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function remove(row) {
  if (!confirm('确定删除？')) return
  try {
    await adminDelete('itemcategories', row._id)
    fetchCategories()
  } catch (e) {
    alert(e.response?.data?.msg || '删除失败')
  }
}
</script>

<style scoped>
.page {
  padding: 20px;
}
</style>
