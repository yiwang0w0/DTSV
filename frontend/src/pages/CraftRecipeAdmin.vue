<template>
  <div class="page admin-page">
    <h2>合成配方管理</h2>
    <el-button type="primary" size="small" @click="openCreate">新建</el-button>
    <el-table :data="recipes" style="margin-top:10px" @row-click="openEdit">
      <el-table-column prop="materials" label="材料" />
      <el-table-column prop="result.name" label="产物" />
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

const recipes = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const formData = ref({})
const editId = ref('')

const fields = [
  { name: 'materials', label: '材料列表', type: 'text' },
  { name: 'result.name', label: '产物名称', type: 'text' },
  { name: 'result.kind', label: '产物类型', type: 'text' },
  { name: 'result.effect', label: '产物效果', type: 'number' },
  { name: 'result.dur', label: '产物耐久', type: 'text' },
  { name: 'result.skill', label: '产物属性', type: 'text' }
]

onMounted(fetchRecipes)

async function fetchRecipes() {
  try {
    const { data } = await adminList('craftrecipes')
    recipes.value = data
  } catch (e) {
    alert(e.response?.data?.msg || '加载失败')
  }
}

function openEdit(row) {
  editId.value = row._id
  dialogTitle.value = '编辑'
  formData.value = { ...row, materials: row.materials.join(',') }
  dialogVisible.value = true
}

function openCreate() {
  dialogTitle.value = '新建'
  formData.value = { materials: '', result: { name: '', kind: '', effect: 0, dur: '1', skill: '' } }
  editId.value = ''
  dialogVisible.value = true
}

async function save() {
  const data = { ...formData.value, materials: formData.value.materials.split(',').map(s => s.trim()) }
  data.materialHash = data.materials.sort().join('|')
  try {
    if (editId.value) {
      await adminUpdate('craftrecipes', editId.value, data)
    } else {
      await adminCreate('craftrecipes', data)
    }
    dialogVisible.value = false
    fetchRecipes()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function remove(row) {
  if (!confirm('确定删除？')) return
  try {
    await adminDelete('craftrecipes', row._id)
    fetchRecipes()
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
