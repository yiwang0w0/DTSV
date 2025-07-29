<template>
  <div class="page">
    <h2>NPC刷新机制管理</h2>
    <div style="margin-bottom:10px">
      <el-button v-if="areaId" size="small" @click="router.push(`/admin/mapresources?area=${areaId}`)">返回</el-button>
      <el-button type="primary" size="small" style="margin-left:5px" @click="openCreate">新建</el-button>
    </div>
    <el-table :data="items" style="width:100%" size="small">
      <el-table-column prop="npc" label="NPC名" />
      <el-table-column prop="num" label="数量" width="80" />
      <el-table-column prop="stage" label="阶段" width="80" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button text size="small" @click="openEdit(row)">编辑</el-button>
          <el-button text size="small" type="danger" @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
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
import { useRoute, useRouter } from 'vue-router'
import FormDialog from '../components/FormDialog.vue'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta } from '../api'

const route = useRoute()
const router = useRouter()
const areaId = ref(route.query.area ? Number(route.query.area) : 0)

const items = ref([])
const fields = ref([])
const npcs = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const formData = ref({})
let editId = ''

onMounted(async () => {
  const { data } = await adminFieldMeta('npcspawns')
  fields.value = data
  await fetchNpcs()
  updateNpcOptions()
  fetchItems()
})

watch(
  () => route.query.area,
  (v) => {
    areaId.value = v ? Number(v) : 0
    fetchItems()
  }
)

async function fetchNpcs() {
  try {
    const { data } = await adminList('npcs', { limit: 1000 })
    npcs.value = data
  } catch {}
}

function updateNpcOptions() {
  const f = fields.value.find((i) => i.name === 'npc')
  if (f) {
    f.options = npcs.value.map((n) => ({ label: n.name, value: n.name }))
  }
}

async function fetchItems() {
  try {
    const params = {}
    if (areaId.value) params.area = areaId.value
    const { data } = await adminList('npcspawns', params)
    items.value = data.map((row) => {
      if (!row.npc) {
        const npc = npcs.value.find(
          (n) => n.type === row.type && (row.sub ? n.sub === row.sub : true)
        )
        if (npc) row.npc = npc.name
      }
      return row
    })
  } catch {}
}

function openCreate() {
  dialogTitle.value = '新建'
  editId = ''
  formData.value = { npc: fields.value[0]?.options[0]?.value || '', num: 1, stage: 'start' }
  dialogVisible.value = true
}

function openEdit(row) {
  dialogTitle.value = '编辑'
  editId = row._id
  formData.value = { npc: row.npc, num: row.num, stage: row.stage }
  dialogVisible.value = true
}

async function saveDialog() {
  const base = npcs.value.find((n) => n.name === formData.value.npc)
  if (!base) return
  const payload = {
    area: areaId.value,
    npc: formData.value.npc,
    type: base.type || 1,
    sub: base.sub || 0,
    num: formData.value.num,
    stage: formData.value.stage
  }
  try {
    if (editId) await adminUpdate('npcspawns', editId, payload)
    else await adminCreate('npcspawns', payload)
    dialogVisible.value = false
    fetchItems()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function removeRow(row) {
  if (!confirm('确定删除？')) return
  await adminDelete('npcspawns', row._id)
  fetchItems()
}
</script>

<style scoped>
.page {
  padding: 20px;
}
</style>
