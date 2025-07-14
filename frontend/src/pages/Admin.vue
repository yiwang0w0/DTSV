<template>
  <div class="page">
    <h2>后台管理</h2>
    <el-select v-model="collection" placeholder="选择集合" style="width: 200px">
      <el-option v-for="c in collections" :key="c.value" :label="c.label" :value="c.value" />
    </el-select>
    <el-button v-if="!isMaps" type="primary" size="small" @click="openCreate" style="margin-left:10px">新建</el-button>
    <el-table :data="items" style="margin-top: 20px" row-key="_id">
      <el-table-column prop="_id" label="ID" width="230" />
      <el-table-column v-for="f in fieldMeta" :key="f.name" :prop="f.name" :label="f.label">
        <template #default="{ row }">
          <span>
            {{ (collection === 'players' && f.name === 'pls') ? (mapAreas[row[f.name]] || row[f.name]) : row[f.name] }}
          </span>
          <el-button v-if="!isMaps" size="small" text @click="openFieldEdit(row, f)">编辑</el-button>
        </template>
      </el-table-column>
      <el-table-column v-if="!isMaps" label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="fieldDialogVisible" :title="'编辑 '+(editField?.label||'')" width="300px">
      <template v-if="editField">
        <el-input v-if="editField.type==='text'" v-model="editValue" />
        <el-input-number v-else-if="editField.type==='number'" v-model="editValue" />
        <el-select v-else-if="editField.type==='select'" v-model="editValue">
          <el-option v-for="op in editField.options" :key="op" :label="op" :value="op" />
        </el-select>
        <el-input v-else v-model="editValue" />
      </template>
      <template #footer>
        <el-button @click="fieldDialogVisible=false">取消</el-button>
        <el-button type="primary" @click="saveField">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="createDialogVisible" title="新建" width="600px">
      <el-form label-width="80px">
        <el-form-item v-for="f in fieldMeta" :key="f.name" :label="f.label">
          <el-input v-if="f.type==='text'" v-model="createData[f.name]" />
          <el-input-number v-else-if="f.type==='number'" v-model="createData[f.name]" />
          <el-select v-else-if="f.type==='select'" v-model="createData[f.name]">
            <el-option v-for="op in f.options" :key="op" :label="op" :value="op" />
          </el-select>
          <el-input v-else v-model="createData[f.name]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible=false">取消</el-button>
        <el-button type="primary" @click="saveCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
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

const collections = [
  { label: '玩家', value: 'players' },
  { label: '商店物品', value: 'shopitems' },
  { label: '日志', value: 'logs' },
  { label: '聊天', value: 'chats' },
  { label: '地图物品', value: 'mapitems' },
  { label: '陷阱', value: 'maptraps' },
  { label: '新闻', value: 'newsinfos' },
  { label: '房间监听', value: 'roomlisteners' },
  { label: '历史记录', value: 'histories' },
  { label: '游戏信息', value: 'gameinfos' },
  { label: '用户', value: 'users' },
  { label: '地图', value: 'maps' },
  { label: '地图区域', value: 'mapareas' }
]

const collection = ref('')
const fieldMeta = ref([])
const items = ref([])

const fieldDialogVisible = ref(false)
const editField = ref(null)
const editRowId = ref('')
const editValue = ref('')

const createDialogVisible = ref(false)
const createData = ref({})
const isMaps = computed(() => collection.value === 'maps')

watch(collection, () => {
  fetchFieldMeta()
  fetchItems()
}, { immediate: true })

async function fetchFieldMeta() {
  if (!collection.value) return
  try {
    const { data } = await adminFieldMeta(collection.value)
    fieldMeta.value = data
  } catch (e) {
    fieldMeta.value = []
  }
}

async function fetchItems() {
  if (!collection.value) return
  try {
    if (collection.value === 'maps') {
      const { data } = await adminMaps()
      items.value = data.map(d => ({
        _id: d.pls,
        pls: d.pls,
        name: d.name,
        players: d.players.map(p => `${p.name}(${p.pid})`).join(', ')
      }))
    } else if (collection.value === 'mapareas') {
      const { data } = await adminList('mapareas')
      items.value = data
      try {
        const res = await getMapAreas()
        mapAreas.value = res.data
      } catch {}
    } else {
      const { data } = await adminList(collection.value)
      if (collection.value === 'players') {
        if (!mapAreas.value.length) {
          try {
            const res = await getMapAreas()
            mapAreas.value = res.data
          } catch {}
        }
      }
      items.value = data
    }
  } catch (e) {
    alert(e.response?.data?.msg || '加载失败')
  }
}

function openFieldEdit(row, field) {
  editRowId.value = row._id
  editField.value = field
  editValue.value = row[field.name]
  fieldDialogVisible.value = true
}

async function saveField() {
  const update = { [editField.value.name]: editValue.value }
  try {
    await adminUpdate(collection.value, editRowId.value, update)
    fieldDialogVisible.value = false
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
    fetchItems()
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function remove(row) {
  if (!confirm('确定删除？')) return
  try {
    await adminDelete(collection.value, row._id)
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

