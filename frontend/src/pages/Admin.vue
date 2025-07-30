<template>
  <div class="admin-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h2 class="page-title">后台管理</h2>
        <p class="page-description">管理系统的各种数据和配置</p>
      </div>
    </div>

    <!-- 操作工具栏 -->
    <el-card class="toolbar-card" shadow="never">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-select 
            v-model="collection" 
            placeholder="选择数据集合" 
            style="width: 240px"
            :loading="loading"
            size="default"
          >
            <el-option
              v-for="c in collections"
              :key="c.value"
              :label="c.label"
              :value="c.value"
            >
              <div class="collection-option">
                <el-icon class="option-icon">
                  <component :is="c.icon" />
                </el-icon>
                <span>{{ c.label }}</span>
              </div>
            </el-option>
          </el-select>
          
          <el-select
            v-if="showAreaFilter"
            v-model="areaFilter"
            placeholder="选择区域"
            style="width: 200px"
            clearable
          >
            <el-option label="全部区域" :value="-1" />
            <el-option
              v-for="area in mapAreas"
              :key="area.pid"
              :label="area.name"
              :value="area.pid"
            />
          </el-select>
        </div>
        
        <div class="toolbar-right">
          <el-button-group>
            <el-button
              :icon="Refresh"
              @click="refreshData"
              :loading="loading"
            >
              刷新
            </el-button>
            
            <el-button
              v-if="!isMaps"
              type="primary"
              :icon="Plus"
              @click="openCreate"
              :loading="loading"
            >
              新建
            </el-button>
            
            <el-button
              v-if="collection === 'itemcategories'"
              :icon="Setting"
              @click="$router.push('/admin/itemcategories')"
            >
              高级编辑
            </el-button>
          </el-button-group>
        </div>
      </div>
    </el-card>

    <!-- 数据表格区域 -->
    <el-card class="table-card" shadow="never">
      <!-- 加载状态 -->
      <div v-if="loading && !items.length" class="loading-container">
        <el-skeleton animated>
          <template #template>
            <div class="table-skeleton">
              <div class="skeleton-header">
                <el-skeleton-item variant="text" style="width: 100px" />
                <el-skeleton-item variant="text" style="width: 120px" />
                <el-skeleton-item variant="text" style="width: 80px" />
                <el-skeleton-item variant="text" style="width: 150px" />
              </div>
              <div class="skeleton-row" v-for="i in 5" :key="i">
                <el-skeleton-item variant="text" style="width: 100px" />
                <el-skeleton-item variant="text" style="width: 120px" />
                <el-skeleton-item variant="text" style="width: 80px" />
                <el-skeleton-item variant="text" style="width: 150px" />
              </div>
            </div>
          </template>
        </el-skeleton>
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="!loading && !items.length" class="empty-container">
        <el-empty
          description="暂无数据"
          :image-size="80"
        >
          <el-button type="primary" @click="openCreate" v-if="!isMaps">
            创建第一条记录
          </el-button>
          <el-button @click="refreshData">
            刷新数据
          </el-button>
        </el-empty>
      </div>
      
      <!-- 数据表格 -->
      <div v-else>
        <el-table
          :data="items"
          stripe
          border
          style="width: 100%"
          :loading="loading"
        >
          <el-table-column
            v-for="field in fieldMeta"
            :key="field.name"
            :prop="field.name"
            :label="field.label"
            :width="getColumnWidth(field)"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <span @click="openFieldEdit(row, field)" style="cursor: pointer;">
                {{ formatValue(row[field.name], field) }}
              </span>
            </template>
          </el-table-column>
          
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button-group size="small">
                <el-button
                  :icon="Edit"
                  @click="openFieldEdit(row, fieldMeta[0])"
                  :disabled="loading"
                />
                <el-button
                  :icon="Delete"
                  type="danger"
                  @click="handleRemove(row)"
                  :disabled="loading"
                />
              </el-button-group>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 加载更多 -->
        <div v-if="!allLoaded && items.length > 0" class="load-more">
          <el-button 
            @click="loadMore" 
            :loading="loading"
            type="text"
            style="width: 100%"
          >
            {{ loading ? '加载中...' : '加载更多' }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="fieldDialogVisible"
      :title="editDialogTitle"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm" label-width="120px">
        <el-form-item 
          v-if="editField"
          :label="editField.label"
          :error="validationErrors[editField.name]"
        >
          <el-input
            v-if="editField.type === 'text' || !editField.type"
            v-model="editForm[editField.name]"
            :placeholder="`请输入${editField.label}`"
          />
          <el-input-number
            v-else-if="editField.type === 'number'"
            v-model="editForm[editField.name]"
            style="width: 100%"
          />
          <el-select
            v-else-if="editField.type === 'select'"
            v-model="editForm[editField.name]"
            style="width: 100%"
          >
            <el-option
              v-for="option in editField.options"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeFieldDialog">取消</el-button>
          <el-button type="primary" @click="saveField" :loading="loading">
            保存
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 新建对话框 -->
    <el-dialog
      v-model="createDialogVisible"
      title="新建记录"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="createData" label-width="120px">
        <el-form-item
          v-for="field in fieldMeta"
          :key="field.name"
          :label="field.label"
          :error="validationErrors[field.name]"
        >
          <el-input
            v-if="field.type === 'text' || !field.type"
            v-model="createData[field.name]"
            :placeholder="`请输入${field.label}`"
          />
          <el-input-number
            v-else-if="field.type === 'number'"
            v-model="createData[field.name]"
            style="width: 100%"
          />
          <el-select
            v-else-if="field.type === 'select'"
            v-model="createData[field.name]"
            style="width: 100%"
          >
            <el-option
              v-for="option in field.options"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeCreateDialog">取消</el-button>
          <el-button type="primary" @click="saveCreate" :loading="loading">
            保存
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Setting, Grid, Box, Location, User, Edit, Delete } from '@element-plus/icons-vue'
import { 
  adminList, 
  adminCreate, 
  adminUpdate, 
  adminDelete, 
  adminFieldMeta, 
  getMapAreas 
} from '../api'
import { mapAreas } from '../store/map'

const router = useRouter()
const route = useRoute()

// 集合配置
const collections = [
  { label: '玩家管理', value: 'players', icon: User },
  { label: 'NPC管理', value: 'npcs', icon: User },
  { label: '物品管理', value: 'items', icon: Box },
  { label: '系统日志', value: 'logs', icon: Grid },
  { label: '聊天记录', value: 'chats', icon: Grid },
  { label: '地图资源', value: 'mapresources', icon: Location },
  { label: '新闻管理', value: 'newsinfos', icon: Grid },
  { label: '房间监听', value: 'roomlisteners', icon: Grid },
  { label: '历史记录', value: 'histories', icon: Grid },
  { label: '游戏信息', value: 'gameinfos', icon: Setting },
  { label: '用户管理', value: 'users', icon: User },
  { label: '地图数据', value: 'maps', icon: Location },
]

// 响应式数据
const collection = ref('')
const areaFilter = ref(-1)
const validationErrors = ref({})
const items = ref([])
const fieldMeta = ref([])
const loading = ref(false)
const allLoaded = ref(false)
const skip = ref(0)
const limit = 50

// 对话框状态
const fieldDialogVisible = ref(false)
const createDialogVisible = ref(false)
const editField = ref(null)
const editRowId = ref('')
const editForm = ref({})
const createData = ref({})

// 计算属性
const showAreaFilter = computed(() => 
  collection.value === 'mapitems' || collection.value === 'npcs'
)
const isMaps = computed(() => collection.value === 'maps')

const editDialogTitle = computed(() => {
  return editField.value ? `编辑 ${editField.value.label}` : '编辑'
})

// 工具函数
const formatValue = (value, field) => {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  
  switch (field.type) {
    case 'date':
      return new Date(value).toLocaleDateString()
    case 'datetime':
      return new Date(value).toLocaleString()
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : value
    default:
      return String(value)
  }
}

const getColumnWidth = (field) => {
  if (field.width) return field.width
  if (field.type === 'number') return 100
  return undefined
}

// 错误处理
const handleError = (error, message = '操作失败') => {
  console.error('Error:', error)
  ElMessage.error(error.response?.data?.msg || message)
}

const handleSuccess = (message = '操作成功') => {
  ElMessage.success(message)
}

const confirmAction = async (message = '确定执行此操作？') => {
  try {
    await ElMessageBox.confirm(message, '确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}

// 数据获取
const fetchFieldMeta = async () => {
  if (!collection.value) return
  
  try {
    const { data } = await adminFieldMeta(collection.value)
    fieldMeta.value = data.map(f => {
      const field = { ...f }
      // 处理特殊字段
      if ((field.name === 'pls' || field.name === 'area') && mapAreas.value.length) {
        field.type = 'select'
        field.options = mapAreas.value.map(a => ({
          label: a.name,
          value: a.pid,
        }))
      }
      return field
    })
  } catch (error) {
    handleError(error, '获取字段信息失败')
    fieldMeta.value = []
  }
}

const fetchItems = async (append = false) => {
  if (!collection.value || loading.value || (allLoaded.value && append)) return
  
  loading.value = true
  try {
    const params = {
      skip: append ? skip.value : 0,
      limit
    }
    
    if (showAreaFilter.value && areaFilter.value !== -1) {
      params.pls = areaFilter.value
    }
    
    const { data } = await adminList(collection.value, params)
    
    if (append) {
      items.value = [...items.value, ...data]
    } else {
      items.value = data
      skip.value = 0
    }
    
    if (data.length < limit) {
      allLoaded.value = true
    }
    
    skip.value += data.length
  } catch (error) {
    handleError(error, '获取数据失败')
  } finally {
    loading.value = false
  }
}

const fetchMapAreas = async () => {
  if (mapAreas.value.length) return
  
  try {
    const { data } = await getMapAreas()
    mapAreas.value = data
  } catch (error) {
    handleError(error, '获取地图区域失败')
  }
}

// 操作方法
const reset = () => {
  items.value = []
  skip.value = 0
  allLoaded.value = false
}

const loadMore = () => {
  if (!allLoaded.value && !loading.value) {
    fetchItems(true)
  }
}

const refreshData = async () => {
  reset()
  await Promise.all([
    fetchFieldMeta(),
    fetchItems()
  ])
}

// 处理集合变更
const handleCollectionChange = async () => {
  if (!collection.value) return
  
  reset()
  validationErrors.value = {}
  
  // 更新路由
  const query = { collection: collection.value }
  if (showAreaFilter.value && areaFilter.value !== -1) {
    query.area = areaFilter.value
  }
  router.replace({ path: '/admin', query })
  
  // 特殊路由处理
  if (collection.value === 'mapresources') {
    router.push('/admin/mapresources')
    return
  }
  
  await Promise.all([
    fetchFieldMeta(),
    fetchMapAreas(),
    fetchItems()
  ])
}

// 处理区域过滤变更
const handleAreaFilterChange = async () => {
  if (!showAreaFilter.value) return
  
  reset()
  await fetchItems()
  
  // 更新路由
  const query = { collection: collection.value }
  if (areaFilter.value !== -1) {
    query.area = areaFilter.value
  }
  router.replace({ path: '/admin', query })
}

// 对话框操作
const openFieldEdit = (row, field) => {
  editRowId.value = row._id
  editField.value = { ...field }
  editForm.value = { [field.name]: row[field.name] }
  validationErrors.value = {}
  fieldDialogVisible.value = true
}

const saveField = async () => {
  try {
    loading.value = true
    await adminUpdate(collection.value, editRowId.value, editForm.value)
    handleSuccess('更新成功')
    closeFieldDialog()
    await refreshData()
  } catch (error) {
    handleError(error, '更新失败')
  } finally {
    loading.value = false
  }
}

const closeFieldDialog = () => {
  fieldDialogVisible.value = false
  editField.value = null
  editRowId.value = ''
  editForm.value = {}
  validationErrors.value = {}
}

const openCreate = () => {
  createData.value = {}
  fieldMeta.value.forEach(field => {
    createData.value[field.name] = field.type === 'number' ? 0 : ''
  })
  validationErrors.value = {}
  createDialogVisible.value = true
}

const saveCreate = async () => {
  try {
    loading.value = true
    await adminCreate(collection.value, createData.value)
    handleSuccess('创建成功')
    closeCreateDialog()
    await refreshData()
  } catch (error) {
    handleError(error, '创建失败')
  } finally {
    loading.value = false
  }
}

const closeCreateDialog = () => {
  createDialogVisible.value = false
  createData.value = {}
  validationErrors.value = {}
}

const handleRemove = async (row) => {
  const confirmed = await confirmAction('确定删除这条记录？')
  if (!confirmed) return
  
  try {
    loading.value = true
    await adminDelete(collection.value, row._id)
    handleSuccess('删除成功')
    await refreshData()
  } catch (error) {
    handleError(error, '删除失败')
  } finally {
    loading.value = false
  }
}

// 监听器
watch(
  () => route.query.collection,
  (v) => {
    if (v && collections.some(c => c.value === v)) {
      collection.value = v
    }
  },
  { immediate: true }
)

watch(
  () => route.query.area,
  (v) => {
    areaFilter.value = v !== undefined ? Number(v) : -1
  },
  { immediate: true }
)

watch(collection, handleCollectionChange)
watch(areaFilter, handleAreaFilterChange)

// 生命周期
onMounted(() => {
  fetchMapAreas()
})
</script>

<style scoped>
@import '../styles/dark-theme.css';
.admin-page {
  min-height: 100%;
  background: transparent;
}

.page-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 32px 24px;
  margin-bottom: 24px;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.page-description {
  font-size: 16px;
  opacity: 0.9;
  margin: 0;
}

.toolbar-card,
.table-card {
  max-width: 1200px;
  margin: 0 auto 24px auto;
  border: 1px solid #333;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collection-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-icon {
  color: #409eff;
}

.loading-container {
  padding: 20px;
}

.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-header,
.skeleton-row {
  display: flex;
  gap: 20px;
  align-items: center;
}

.skeleton-header {
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
}

.empty-container {
  padding: 40px 20px;
}

.load-more {
  margin-top: 16px;
  text-align: center;
  border-top: 1px solid #333;
  padding-top: 16px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .toolbar-left,
  .toolbar-right {
    justify-content: center;
  }
  
  .page-header {
    padding: 24px 16px;
  }
  
  .toolbar-card,
  .table-card {
    margin: 0 16px 16px 16px;
  }
}
</style>