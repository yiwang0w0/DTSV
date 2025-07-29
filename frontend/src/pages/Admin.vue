<template>
  <div class="page">
    <h2>后台管理</h2>
    <el-select v-model="collection" placeholder="选择集合" style="width: 200px">
      <el-option v-for="c in collections" :key="c.value" :label="c.label" :value="c.value" />
    </el-select>
    <el-select
      v-if="collection === 'mapitems'"
      v-model="areaFilter"
      placeholder="区域过滤"
      style="width: 160px; margin-left:10px"
    >
      <el-option :label="'全部'" :value="-1" />
      <el-option v-for="area in mapAreas" :key="area.pid" :label="area.name" :value="area.pid" />
    </el-select>
    <el-button v-if="!isMaps" type="primary" size="small" @click="openCreate" style="margin-left:10px">新建</el-button>
    <el-button v-if="collection === 'itemcategories'" size="small" style="margin-left:10px" @click="$router.push('/admin/itemcategories')">高级编辑</el-button>
    <TablePanel
      :items="items"
      :field-meta="fieldMeta"
      :is-maps="isMaps"
      :loading="loading"
      :map-areas="mapAreas"
      @load-more="loadMore"
      @edit="openFieldEdit"
      @remove="remove"
    />
    <FormDialog
      v-model="fieldDialogVisible"
      :title="'编辑 '+(editField?.label||'')"
      :fields="editField ? [editField] : []"
      :form="editForm"
      @close="fieldDialogVisible=false"
      @save="saveField"
    />
    <FormDialog
      v-model="createDialogVisible"
      title="新建"
      :fields="fieldMeta"
      :form="createData"
      @close="createDialogVisible=false"
      @save="saveCreate"
    />
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import TablePanel from '../components/TablePanel.vue'
import FormDialog from '../components/FormDialog.vue'
import {
  adminList,
  adminCreate,
  adminUpdate,
  adminDelete,
  adminFieldMeta,
  adminMaps,
  getMapAreas
} from '../api'
import { mapAreas } from '../store/map'
import { trapTypeText } from '../constants/enums'

const router = useRouter()
const collections = [
  { label: '玩家', value: 'players' },
  { label: 'NPC', value: 'npcs' },
  { label: '物品表', value: 'items' },
  { label: '日志', value: 'logs' },
  { label: '聊天', value: 'chats' },
  { label: '地图资源', value: 'mapresources' },
  { label: 'NPC刷新机制', value: 'npcspawns' },
  { label: '新闻', value: 'newsinfos' },
  { label: '房间监听', value: 'roomlisteners' },
  { label: '历史记录', value: 'histories' },
  { label: '游戏信息', value: 'gameinfos' },
  { label: '用户', value: 'users' },
  { label: '地图', value: 'maps' }
]

const collection = ref('')
const fieldMeta = ref([])
const items = ref([])
const skip = ref(0)
const limit = 50
const loading = ref(false)
const allLoaded = ref(false)

const fieldDialogVisible = ref(false)
const editField = ref(null)
const editRowId = ref('')
const editForm = ref({})

const createDialogVisible = ref(false)
const createData = ref({})
const isMaps = computed(() => collection.value === 'maps')
const areaFilter = ref(-1)

watch(collection, () => {
  if (collection.value === 'mapresources') {
    router.push('/admin/mapresources')
    return
  }
  if (collection.value === 'npcspawns') {
    router.push('/admin/npcspawns')
    return
  }
  skip.value = 0
  allLoaded.value = false
  items.value = []
  fetchFieldMeta()
  fetchItems()
}, { immediate: true })
watch(areaFilter, () => {
  if (collection.value === 'mapitems') {
    skip.value = 0
    allLoaded.value = false
    items.value = []
    fetchItems()
  }
})

async function fetchFieldMeta() {
  if (!collection.value) return
  try {
    if ((collection.value === 'maptraps' || collection.value === 'mapitems' || collection.value === 'players') && !mapAreas.value.length) {
      try {
        const res = await getMapAreas()
        mapAreas.value = res.data
      } catch {}
    }
    const { data } = await adminFieldMeta(collection.value)
    fieldMeta.value = data.map(f => {
      const nf = { ...f }
      if ((nf.name === 'pls' || nf.name === 'area') && mapAreas.value.length) {
        nf.type = 'select'
        nf.options = mapAreas.value.map(a => ({ label: a.name, value: a.pid }))
      }
      if (collection.value === 'maptraps' && nf.name === 'itmk') {
        nf.type = 'select'
        nf.options = Object.entries(trapTypeText).map(([k, v]) => ({ label: v, value: k }))
      }
      return nf
    })
  } catch (e) {
    fieldMeta.value = []
  }
}

async function fetchItems(append = false) {
  if (!collection.value || loading.value || allLoaded.value) return
  loading.value = true
  try {
    if (collection.value === 'maps') {
      const { data } = await adminMaps()
      const list = data.map(d => ({
        _id: d.pls,
        pls: d.pls,
        name: d.name,
        players: d.players.map(p => `${p.name}(${p.pid})`).join(', ')
      }))
      items.value = append ? items.value.concat(list) : list
      if (list.length < limit) allLoaded.value = true
      skip.value += list.length
    } else if (collection.value === 'maptraps') {
      if (!mapAreas.value.length) {
        try {
          const res = await getMapAreas()
          mapAreas.value = res.data
        } catch {}
      }
      const { data } = await adminList('maptraps', { skip: skip.value, limit })
      items.value = append ? items.value.concat(data) : data
      if (data.length < limit) allLoaded.value = true
      skip.value += data.length
    } else if (collection.value === 'mapitems') {
      if (!mapAreas.value.length) {
        try {
          const res = await getMapAreas()
          mapAreas.value = res.data
        } catch {}
      }
      const params = { skip: skip.value, limit }
      if (areaFilter.value !== -1) params.pls = areaFilter.value
      const { data } = await adminList('mapitems', params)
      items.value = append ? items.value.concat(data) : data
      if (data.length < limit) allLoaded.value = true
      skip.value += data.length
    } else {
      const { data } = await adminList(collection.value, { skip: skip.value, limit })
      if (collection.value === 'players') {
        if (!mapAreas.value.length) {
          try {
            const res = await getMapAreas()
            mapAreas.value = res.data
          } catch {}
        }
      }
      items.value = append ? items.value.concat(data) : data
      if (data.length < limit) allLoaded.value = true
      skip.value += data.length
    }
  } catch (e) {
    alert(e.response?.data?.msg || '加载失败')
  } finally {
    loading.value = false
  }
}

function loadMore() {
  fetchItems(true)
}

function openFieldEdit(row, field) {
  editRowId.value = row._id
  const f = { ...field }
  if ((f.name === 'pls' || f.name === 'area') && mapAreas.value.length) {
    f.type = 'select'
    f.options = mapAreas.value.map(a => ({ label: a.name, value: a.pid }))
  }
  if (collection.value === 'maptraps' && f.name === 'itmk') {
    f.type = 'select'
    f.options = Object.entries(trapTypeText).map(([k, v]) => ({ label: v, value: k }))
  }
  editField.value = f
  editForm.value = { [field.name]: row[field.name] }
  fieldDialogVisible.value = true
}

async function saveField() {
  const update = { [editField.value.name]: editForm.value[editField.value.name] }
  try {
    await adminUpdate(collection.value, editRowId.value, update)
    fieldDialogVisible.value = false
    skip.value = 0
    allLoaded.value = false
    items.value = []
    fetchItems()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

function openCreate() {
  createData.value = {}
  fieldMeta.value.forEach(f => {
    createData.value[f.name] = f.type === 'number' ? 0 : ''
  })
  createDialogVisible.value = true
}

async function saveCreate() {
  try {
    await adminCreate(collection.value, createData.value)
    createDialogVisible.value = false
    skip.value = 0
    allLoaded.value = false
    items.value = []
    fetchItems()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function remove(row) {
  if (!confirm('确定删除？')) return
  try {
    await adminDelete(collection.value, row._id)
    skip.value = 0
    allLoaded.value = false
    items.value = []
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
pre {
  margin: 0;
  font-family: monospace;
  white-space: pre-wrap;
}
</style>

