<template>
  <div class="empty-container">
    <el-empty
      :image="image"
      :image-size="imageSize"
      :description="description || '暂无数据'"
    >
      <template #default>
        <slot>
          <el-button v-if="showCreate" type="primary" @click="$emit('create')">
            {{ createText || '创建第一条记录' }}
          </el-button>
          <el-button v-if="showRefresh" @click="$emit('refresh')">
            刷新
          </el-button>
        </slot>
      </template>
    </el-empty>
  </div>
</template>

<script setup>
defineProps({
  description: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: ''
  },
  imageSize: {
    type: Number,
    default: 200
  },
  showCreate: {
    type: Boolean,
    default: false
  },
  showRefresh: {
    type: Boolean,
    default: false
  },
  createText: {
    type: String,
    default: ''
  }
})

defineEmits(['create', 'refresh'])
</script>

<style scoped>
.empty-container {
  padding: 40px 20px;
}
</style>

<!-- hooks/useAsyncOperation.js -->
import { ref } from 'vue'
import { useErrorHandler } from './useErrorHandler'

export function useAsyncOperation() {
  const { handleError, handleSuccess } = useErrorHandler()
  
  const loading = ref(false)
  const error = ref(null)
  
  const execute = async (operation, successMessage = null, errorMessage = null) => {
    try {
      loading.value = true
      error.value = null
      
      const result = await operation()
      
      if (successMessage) {
        handleSuccess(successMessage)
      }
      
      return result
    } catch (err) {
      error.value = err
      handleError(err, errorMessage)
      throw err
    } finally {
      loading.value = false
    }
  }
  
  const reset = () => {
    loading.value = false
    error.value = null
  }
  
  return {
    loading,
    error,
    execute,
    reset
  }
}