<template>
  <div class="page">
    <h2>地图资源管理</h2>
    <el-button type="primary" size="small" style="margin-bottom:10px" @click="openCreateArea">新建地图</el-button>
    <el-row :gutter="20" style="margin-top:10px">
      <el-col v-for="a in areas" :key="a.pid" :span="8">
        <el-card shadow="hover">
          <template #header>
            <span>{{ a.name }} (ID: {{ a.pid }}, 危险度: {{ a.danger }})</span>
            <div style="float:right">
              <el-button text size="small" @click="editArea(a)">编辑</el-button>
              <el-button text size="small" type="danger" @click="removeArea(a)">删除</el-button>
            </div>
          </template>
          <div class="btn-row">
            <el-button size="small" @click="goItems(a.pid)">地图物品</el-button>
            <el-button size="small" @click="goItemTable(a.pid)">物品刷新表</el-button>
          </div>
          <div class="btn-row">
            <el-button size="small" @click="goTraps(a.pid)">地图陷阱</el-button>
            <el-button size="small" @click="goTrapTable(a.pid)">陷阱刷新表</el-button>
          </div>
          <div class="btn-row">
            <el-button size="small" @click="goNpcAdmin(a.pid)">NPC</el-button>
            <el-button size="small" @click="goNpcSpawn(a.pid)">NPC刷新表</el-button>
          </div>
          <div class="btn-row">
            <span>商店</span>
            <el-switch v-model="shopMap[a.pid]" size="small" @change="val => toggleShop(a.pid, val)" style="margin:0 5px"/>
            <el-button v-if="shopMap[a.pid]" size="small" @click="goShop(a.pid)">商店物品</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
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
import { useRouter } from 'vue-router'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta } from '../api'
import FormDialog from '../components/FormDialog.vue'

const router = useRouter()
const areas = ref([])
const shopMap = ref({})

const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogFields = ref([])
const formData = ref({})
let editId = ''

onMounted(() => {
  fetchAreas()
})

async function fetchAreas() {
  try {
    const [areasRes, shopsRes] = await Promise.all([
      adminList('mapareas', { limit: 1000 }),
      adminList('shopitems', { limit: 1000 })
    ])
    areas.value = areasRes.data
    const map = {}
    ;(shopsRes.data || []).forEach(s => { map[s.area] = true })
    shopMap.value = map
  } catch {}
}

function goItems(pid) {
  router.push({ path: '/admin/mapitems', query: { area: pid } })
}

function goItemTable(pid) {
  router.push({ path: '/admin/mapitemtable', query: { area: pid } })
}

function goTraps(pid) {
  router.push({ path: '/admin/maptraps', query: { area: pid } })
}

function goTrapTable(pid) {
  router.push({ path: '/admin/maptraptable', query: { area: pid } })
}

function goNpcSpawn(pid) {
  router.push({ path: '/admin/npcspawns', query: { area: pid } })
}

function goShop(pid) {
  router.push({ path: '/admin/shopitems', query: { area: pid } })
}

function goNpcAdmin(pid) {
  router.push({ path: '/admin', query: { collection: 'npcs', area: pid } })
}

async function openCreateArea() {
  const { data: fields } = await adminFieldMeta('mapareas')
  dialogFields.value = fields
  dialogTitle.value = '新建地图'
  formData.value = {}
  editId = ''
  dialogVisible.value = true
}

async function editArea(area) {
  const { data: fields } = await adminFieldMeta('mapareas')
  dialogFields.value = fields
  dialogTitle.value = '编辑地图'
  formData.value = { ...area }
  editId = area._id
  dialogVisible.value = true
}

async function removeArea(area) {
  if (!confirm('确定删除？')) return
  await adminDelete('mapareas', area._id)
  fetchAreas()
}

async function saveDialog() {
  try {
    if (editId) await adminUpdate('mapareas', editId, formData.value)
    else await adminCreate('mapareas', formData.value)
    dialogVisible.value = false
    fetchAreas()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

function toggleShop(pid, val) {
  shopMap.value = { ...shopMap.value, [pid]: val }
}
</script>

<style scoped>
.page { padding: 20px; }
.btn-row { display:flex; justify-content:center; margin-bottom:4px; gap:6px; }
</style>

