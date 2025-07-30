<!-- components/TablePanel.vue -->
<template>
  <div class="table-panel">
    <!-- 表格工具栏 -->
    <div class="table-toolbar" v-if="showToolbar">
      <div class="toolbar-left">
        <span class="data-count">
          共 <strong>{{ total || items.length }}</strong> 条记录
        </span>
      </div>
      <div class="toolbar-right">
        <el-space>
          <!-- 密度切换 -->
          <el-tooltip content="表格密度">
            <el-dropdown @command="handleDensityChange">
              <el-button :icon="Operation" circle size="small" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="'large'" :class="{ active: tableSize === 'large' }">
                    宽松
                  </el-dropdown-item>
                  <el-dropdown-item :command="'default'" :class="{ active: tableSize === 'default' }">
                    默认
                  </el-dropdown-item>
                  <el-dropdown-item :command="'small'" :class="{ active: tableSize === 'small' }">
                    紧凑
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-tooltip>
          
          <!-- 列设置 -->
          <el-tooltip content="列设置">
            <el-popover placement="bottom-end" :width="280" trigger="click">
              <template #reference>
                <el-button :icon="Setting" circle size="small" />
              </template>
              <div class="column-settings">
                <div class="settings-header">
                  <span>列显示设置</span>
                  <el-button text size="small" @click="resetColumns">重置</el-button>
                </div>
                <el-checkbox-group v-model="visibleColumns" class="column-list">
                  <div v-for="field in fieldMeta" :key="field.name" class="column-item">
                    <el-checkbox :label="field.name">{{ field.label }}</el-checkbox>
                  </div>
                </el-checkbox-group>
              </div>
            </el-popover>
          </el-tooltip>
        </el-space>
      </div>
    </div>

    <!-- 主表格 -->
    <el-table
      ref="tableRef"
      :data="items"
      :size="tableSize"
      :loading="loading"
      stripe
      border
      class="data-table"
      :header-cell-style="headerCellStyle"
      :cell-style="cellStyle"
      @sort-change="handleSortChange"
      @selection-change="handleSelectionChange"
    >
      <!-- 选择列 -->
      <el-table-column
        v-if="showSelection"
        type="selection"
        width="50"
        fixed="left"
      />
      
      <!-- 序号列 -->
      <el-table-column
        v-if="showIndex"
        type="index"
        label="#"
        width="60"
        fixed="left"
      />

      <!-- 数据列 -->
      <el-table-column
        v-for="field in visibleFields"
        :key="field.name"
        :prop="field.name"
        :label="field.label"
        :width="getColumnWidth(field)"
        :min-width="getColumnMinWidth(field)"
        :sortable="field.sortable ? 'custom' : false"
        :fixed="field.fixed"
        :show-overflow-tooltip="true"
      >
        <template #default="{ row, column, $index }">
          <div class="cell-content">
            <!-- 特殊字段渲染 -->
            <template v-if="field.type === 'image'">
              <el-avatar 
                :src="row[field.name]" 
                :size="32"
                fit="cover"
              >
                <el-icon><Picture /></el-icon>
              </el-avatar>
            </template>
            
            <template v-else-if="field.type === 'switch'">
              <el-switch
                :model-value="row[field.name]"
                @change="(val) => handleQuickEdit(row, field.name, val)"
                :disabled="!allowQuickEdit"
              />
            </template>
            
            <template v-else-if="field.type === 'tag'">
              <el-tag 
                :type="getTagType(field, row[field.name])"
                size="small"
              >
                {{ formatValue(row[field.name], field) }}
              </el-tag>
            </template>
            
            <template v-else-if="field.type === 'progress'">
              <el-progress
                :percentage="Number(row[field.name]) || 0"
                :stroke-width="6"
                :show-text="false"
              />
            </template>
            
            <template v-else-if="field.type === 'link'">
              <el-link 
                :href="row[field.name]" 
                target="_blank"
                :underline="false"
              >
                {{ formatValue(row[field.name], field) }}
              </el-link>
            </template>
            
            <!-- 默认文本显示 -->
            <template v-else>
              <span 
                class="cell-text"
                :class="{ 
                  'is-number': field.type === 'number',
                  'is-clickable': allowQuickEdit && isEditableField(field)
                }"
                @click="isEditableField(field) && handleCellClick(row, field)"
              >
                {{ formatValue(row[field.name], field) }}
              </span>
            </template>
          </div>
        </template>
      </el-table-column>

      <!-- 操作列 -->
      <el-table-column
        label="操作"
        :width="actionColumnWidth"
        fixed="right"
        v-if="showActions"
      >
        <template #default="{ row, $index }">
          <div class="action-buttons">
            <el-button-group size="small">
              <el-tooltip content="编辑">
                <el-button
                  :icon="Edit"
                  @click="handleEdit(row)"
                  :disabled="loading"
                />
              </el-tooltip>
              
              <el-tooltip content="删除">
                <el-button
                  :icon="Delete"
                  type="danger"
                  @click="handleDelete(row)"
                  :disabled="loading"
                />
              </el-tooltip>
              
              <!-- 自定义操作按钮 -->
              <template v-for="action in customActions" :key="action.key">
                <el-tooltip :content="action.label">
                  <el-button
                    :icon="action.icon"
                    :type="action.type || 'default'"
                    @click="action.handler(row, $index)"
                    :disabled="loading || action.disabled?.(row)"
                  />
                </el-tooltip>
              </template>
            </el-button-group>
          </div>
        </template>
      </el-table-column>

      <!-- 空状态 -->
      <template #empty>
        <el-empty
          description="暂无数据"
          :image-size="80"
        >
          <el-button type="primary" @click="$emit('refresh')">
            刷新数据
          </el-button>
        </el-empty>
      </template>
    </el-table>

    <!-- 表格底部 -->
    <div class="table-footer" v-if="showFooter">
      <div class="footer-left">
        <span v-if="selectedRows.length > 0" class="selection-info">
          已选择 <strong>{{ selectedRows.length }}</strong> 项
          <el-button 
            text 
            size="small" 
            @click="clearSelection"
            style="margin-left: 8px"
          >
            清空
          </el-button>
        </span>
      </div>
      
      <div class="footer-right">
        <el-pagination
          v-if="showPagination"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
        
        <el-button
          v-else-if="!allLoaded"
          @click="$emit('load-more')"
          :loading="loading"
          type="text"
        >
          加载更多
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  Edit, Delete, Setting, Operation, Picture
} from '@element-plus/icons-vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  fieldMeta: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  allLoaded: { type: Boolean, default: false },
  showToolbar: { type: Boolean, default: true },
  showActions: { type: Boolean, default: true },
  showSelection: { type: Boolean, default: false },
  showIndex: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },
  showPagination: { type: Boolean, default: false },
  allowQuickEdit: { type: Boolean, default: false },
  customActions: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'edit', 'remove', 'load-more', 'refresh',
  'sort-change', 'page-change', 'quick-edit'
])

// 表格配置
const tableRef = ref()
const tableSize = ref('default')
const selectedRows = ref([])
const currentPage = ref(1)
const pageSize = ref(20)

// 列显示控制
const visibleColumns = ref([])
const visibleFields = computed(() => {
  return props.fieldMeta.filter(field => 
    visibleColumns.value.includes(field.name)
  )
})

// 初始化可见列
watch(() => props.fieldMeta, (newFields) => {
  if (newFields.length > 0 && visibleColumns.value.length === 0) {
    visibleColumns.value = newFields.map(field => field.name)
  }
}, { immediate: true })

// 样式配置
const headerCellStyle = {
  background: '#fafafa',
  color: '#262626',
  fontWeight: '600',
  borderBottom: '1px solid #e8e8e8'
}

const cellStyle = {
  borderBottom: '1px solid #f0f0f0'
}

// 计算操作列宽度
const actionColumnWidth = computed(() => {
  const baseWidth = 120
  const customActionsWidth = props.customActions.length * 40
  return baseWidth + customActionsWidth
})

// 获取列宽度
const getColumnWidth = (field) => {
  if (field.width) return field.width
  if (field.type === 'switch') return 80
  if (field.type === 'image') return 80
  if (field.type === 'tag') return 100
  return undefined
}

const getColumnMinWidth = (field) => {
  if (field.minWidth) return field.minWidth
  if (field.type === 'number') return 80
  return 120
}

// 格式化值显示
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
    case 'currency':
      return `¥${Number(value).toFixed(2)}`
    case 'percent':
      return `${Number(value)}%`
    default:
      return String(value)
  }
}

// 获取标签类型
const getTagType = (field, value) => {
  if (field.tagTypes && field.tagTypes[value]) {
    return field.tagTypes[value]
  }
  return 'default'
}

// 判断是否可编辑字段
const isEditableField = (field) => {
  return props.allowQuickEdit && 
         ['text', 'number'].includes(field.type) && 
         !field.readonly
}

// 事件处理
const handleDensityChange = (size) => {
  tableSize.value = size
}

const resetColumns = () => {
  visibleColumns.value = props.fieldMeta.map(field => field.name)
}

const handleSortChange = ({ prop, order }) => {
  emit('sort-change', { prop, order })
}

const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

const clearSelection = () => {
  tableRef.value.clearSelection()
}

const handleEdit = (row) => {
  emit('edit', row)
}

const handleDelete = (row) => {
  emit('remove', row)
}

const handleCellClick = (row, field) => {
  emit('edit', row, field)
}

const handleQuickEdit = (row, fieldName, value) => {
  emit('quick-edit', { row, field: fieldName, value })
}

const handleSizeChange = (size) => {
  pageSize.value = size
  emit('page-change', { page: currentPage.value, size })
}

const handleCurrentChange = (page) => {
  currentPage.value = page
  emit('page-change', { page, size: pageSize.value })
}
</script>

<style scoped>
.table-panel {
  background: #fff;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.data-count {
  color: #666;
  font-size: 14px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.column-settings {
  max-height: 300px;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
}

.column-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.column-item {
  padding: 4px 0;
}

.data-table {
  border-radius: 6px;
  overflow: hidden;
}

.cell-content {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.cell-text {
  flex: 1;
  word-break: break-word;
}

.cell-text.is-number {
  text-align: right;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}

.cell-text.is-clickable {
  cursor: pointer;
  color: #409eff;
}

.cell-text.is-clickable:hover {
  text-decoration: underline;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-top: 1px solid #f0f0f0;
  margin-top: 16px;
}

.footer-left {
  display: flex;
  align-items: center;
}

.selection-info {
  color: #666;
  font-size: 14px;
}

.footer-right {
  display: flex;
  align-items: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .table-toolbar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .toolbar-left,
  .toolbar-right {
    justify-content: center;
  }
  
  .table-footer {
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }
}

/* Element Plus 样式覆盖 */
:deep(.el-table) {
  font-size: 14px;
}

:deep(.el-table .el-table__cell) {
  padding: 12px 8px;
}

:deep(.el-table--small .el-table__cell) {
  padding: 8px 8px;
}

:deep(.el-table--large .el-table__cell) {
  padding: 16px 8px;
}

:deep(.el-table th.el-table__cell) {
  background: #fafafa !important;
}

:deep(.el-table tr:hover > td.el-table__cell) {
  background: #f5f7fa !important;
}

:deep(.el-table__empty-block) {
  background: #fff;
}

:deep(.el-dropdown-menu__item.active) {
  color: #409eff;
  background: #ecf5ff;
}

:deep(.el-button-group .el-button) {
  border-left: 1px solid #dcdfe6;
}

:deep(.el-button-group .el-button:first-child) {
  border-left: none;
}
</style>