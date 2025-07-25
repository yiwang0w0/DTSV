<template>
  <div class="page">
    <h2>物品管理</h2>
    <el-segmented v-model="currentKind" :options="kindOptions" style="margin-bottom:10px" />
    <el-button type="primary" size="small" @click="openCreate" style="margin-left:10px">新建</el-button>
    <el-table :data="items" style="margin-top:10px" @row-click="openEdit">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="kind" label="种类" width="80" />
      <el-table-column prop="effect" label="效果值" width="80" />
      <el-table-column prop="dur" label="耐久/数量" width="100" />
      <el-table-column prop="skill" label="属性" />
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
import { ref, watch } from 'vue'
import { adminList, adminCreate, adminUpdate, adminDelete } from '../api'
import FormDialog from '../components/FormDialog.vue'

const items = ref([])
const kindOptions = ref([])
const currentKind = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('')
const formData = ref({})
const editId = ref('')

const fields = [
  { name: 'name', label: '名称', type: 'text' },
  { name: 'kind', label: '种类', type: 'text' },
  { name: 'effect', label: '效果值', type: 'number' },
  { name: 'dur', label: '耐久/数量', type: 'text' },
  { name: 'skill', label: '属性', type: 'text' }
]

watch(currentKind, fetchItems, { immediate: true })

async function fetchItems() {
  try {
    const { data } = await adminList('items', { kind: currentKind.value })
    items.value = data
    if (!kindOptions.value.length) {
      const { data: all } = await adminList('items', { skip: 0, limit: 1000 })
      const kinds = Array.from(new Set(all.map(i => i.kind)))
      kindOptions.value = kinds.map(k => ({ label: k, value: k }))
      if (!currentKind.value && kinds.length) currentKind.value = kinds[0]
    }
  } catch (e) {
    alert(e.response?.data?.msg || '加载失败')
  }
}

function openEdit(row) {
  editId.value = row._id
  dialogTitle.value = '编辑 ' + row.name
  formData.value = { ...row }
  dialogVisible.value = true
}

function openCreate() {
  dialogTitle.value = '新建'
  formData.value = { name: '', kind: currentKind.value, effect: 0, dur: '1', skill: '' }
  editId.value = ''
  dialogVisible.value = true
}

async function save() {
  try {
    if (editId.value) {
      await adminUpdate('items', editId.value, formData.value)
    } else {
      await adminCreate('items', formData.value)
    }
    dialogVisible.value = false
    fetchItems()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function remove(row) {
  if (!confirm('确定删除？')) return
  try {
    await adminDelete('items', row._id)
    fetchItems()
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
