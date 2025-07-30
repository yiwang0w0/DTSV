<template>
  <div class="error-container">
    <el-result
      :icon="iconType"
      :title="title || '出现错误'"
      :sub-title="subTitle || error?.message || '操作失败，请稍后重试'"
    >
      <template #extra>
        <el-button v-if="showRetry" type="primary" @click="$emit('retry')">
          重试
        </el-button>
        <el-button v-if="showBack" @click="$emit('back')">
          返回
        </el-button>
        <slot name="actions"></slot>
      </template>
      
      <!-- 详细错误信息（开发模式） -->
      <div v-if="showDetails && isDev" class="error-details">
        <el-collapse>
          <el-collapse-item title="错误详情">
            <pre class="error-stack">{{ errorDetails }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-result>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  error: {
    type: [Error, Object],
    default: null
  },
  title: {
    type: String,
    default: ''
  },
  subTitle: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'error', // error, warning, info
    validator: (value) => ['error', 'warning', 'info'].includes(value)
  },
  showRetry: {
    type: Boolean,
    default: true
  },
  showBack: {
    type: Boolean,
    default: false
  },
  showDetails: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['retry', 'back'])

const isDev = computed(() => {
  return process.env.NODE_ENV === 'development'
})

const iconType = computed(() => {
  const iconMap = {
    error: 'error',
    warning: 'warning',
    info: 'info'
  }
  return iconMap[props.type] || 'error'
})

const errorDetails = computed(() => {
  if (!props.error) return ''
  
  return JSON.stringify({
    message: props.error.message,
    stack: props.error.stack,
    response: props.error.response?.data,
    status: props.error.response?.status
  }, null, 2)
})
</script>

<style scoped>
.error-container {
  padding: 40px 20px;
}

.error-details {
  margin-top: 20px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.error-stack {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>