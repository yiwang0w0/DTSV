<template>
  <div class="loading-container" v-if="loading">
    <el-skeleton v-if="type === 'table'" animated>
      <template #template>
        <div class="table-skeleton">
          <div class="skeleton-header">
            <el-skeleton-item variant="text" style="width: 100px" />
            <el-skeleton-item variant="text" style="width: 120px" />
            <el-skeleton-item variant="text" style="width: 80px" />
            <el-skeleton-item variant="text" style="width: 150px" />
          </div>
          <div class="skeleton-row" v-for="i in rows" :key="i">
            <el-skeleton-item variant="text" style="width: 100px" />
            <el-skeleton-item variant="text" style="width: 120px" />
            <el-skeleton-item variant="text" style="width: 80px" />
            <el-skeleton-item variant="text" style="width: 150px" />
          </div>
        </div>
      </template>
    </el-skeleton>
    
    <div v-else-if="type === 'form'" class="form-skeleton">
      <div class="skeleton-form-item" v-for="i in rows" :key="i">
        <el-skeleton-item variant="text" style="width: 80px; height: 16px" />
        <el-skeleton-item variant="rect" style="width: 100%; height: 32px; margin-top: 8px" />
      </div>
    </div>
    
    <div v-else class="simple-loading">
      <el-icon class="is-loading">
        <Loading />
      </el-icon>
      <span class="loading-text">{{ message || '加载中...' }}</span>
    </div>
  </div>
</template>

<script setup>
import { Loading } from '@element-plus/icons-vue'

defineProps({
  loading: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'simple', // simple, table, form
    validator: (value) => ['simple', 'table', 'form'].includes(value)
  },
  rows: {
    type: Number,
    default: 3
  },
  message: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
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
  border-bottom: 1px solid #ebeef5;
}

.form-skeleton {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.skeleton-form-item {
  display: flex;
  flex-direction: column;
}

.simple-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  min-height: 100px;
}

.loading-text {
  color: #909399;
  font-size: 14px;
}
</style>