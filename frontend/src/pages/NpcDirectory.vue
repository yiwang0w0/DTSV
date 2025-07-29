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
import { ref, onMounted } from 'vue'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta } from '../api'
import FormDialog from '../components/FormDialog.vue'

const items = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const fields = ref([])
const formData = ref({})
let editId = ''

onMounted(() => {
  fetchItems()
  fetchFields()
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
    fields.value = data
  } catch {}
}

function openCreate() {
  dialogTitle.value = '新建'
  formData.value = { spawnStage: 'start', pls: 0 }
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
  try {
    if (editId) await adminUpdate('npcs', editId, formData.value)
    else await adminCreate('npcs', formData.value)
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
</script>

<style scoped>
.page { padding: 20px; }
</style>
