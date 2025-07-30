// hooks/useAsyncOperation.js
import { ref, computed } from 'vue'
import { useErrorHandler } from './useErrorHandler'

export function useAsyncOperation(options = {}) {
  const { handleError, handleSuccess } = useErrorHandler()
  
  const loading = ref(false)
  const error = ref(null)
  const data = ref(null)
  const startTime = ref(null)
  
  // 配置选项
  const config = {
    // 自动重试次数
    retryCount: options.retryCount || 0,
    // 重试延迟 (ms)
    retryDelay: options.retryDelay || 1000,
    // 最小加载时间 (ms) - 防止闪烁
    minLoadingTime: options.minLoadingTime || 500,
    // 是否自动显示成功/错误消息
    autoMessage: options.autoMessage !== false,
    // 是否抛出错误
    throwError: options.throwError || false,
    ...options
  }

  // 计算属性
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => !!error.value)
  const hasData = computed(() => data.value !== null && data.value !== undefined)
  const loadingTime = computed(() => {
    return startTime.value ? Date.now() - startTime.value : 0
  })

  // 等待最小加载时间
  const waitMinLoadingTime = async () => {
    if (config.minLoadingTime > 0 && startTime.value) {
      const elapsed = Date.now() - startTime.value
      const remaining = config.minLoadingTime - elapsed
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining))
      }
    }
  }

  // 重试机制
  const executeWithRetry = async (operation, retryAttempt = 0) => {
    try {
      return await operation()
    } catch (err) {
      if (retryAttempt < config.retryCount) {
        console.log(`Retrying operation, attempt ${retryAttempt + 1}/${config.retryCount}`)
        
        // 等待重试延迟
        if (config.retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay))
        }
        
        return executeWithRetry(operation, retryAttempt + 1)
      } else {
        throw err
      }
    }
  }

  // 主执行函数
  const execute = async (operation, options = {}) => {
    const {
      successMessage = options.successMessage || config.successMessage,
      errorMessage = options.errorMessage || config.errorMessage,
      onSuccess = options.onSuccess || config.onSuccess,
      onError = options.onError || config.onError,
      onFinally = options.onFinally || config.onFinally,
      transform = options.transform || config.transform
    } = options

    try {
      loading.value = true
      error.value = null
      startTime.value = Date.now()
      
      // 执行操作（带重试）
      let result = await executeWithRetry(operation)
      
      // 数据转换
      if (transform && typeof transform === 'function') {
        result = transform(result)
      }
      
      data.value = result
      
      // 等待最小加载时间
      await waitMinLoadingTime()
      
      // 成功回调
      if (onSuccess) {
        await onSuccess(result)
      }
      
      // 自动显示成功消息
      if (config.autoMessage && successMessage) {
        handleSuccess(successMessage)
      }
      
      return result
      
    } catch (err) {
      error.value = err
      
      // 等待最小加载时间
      await waitMinLoadingTime()
      
      // 错误回调
      if (onError) {
        await onError(err)
      }
      
      // 自动显示错误消息
      if (config.autoMessage) {
        handleError(err, errorMessage)
      }
      
      // 是否抛出错误
      if (config.throwError) {
        throw err
      }
      
      return null
      
    } finally {
      loading.value = false
      startTime.value = null
      
      // 最终回调
      if (onFinally) {
        await onFinally()
      }
    }
  }

  // 重置状态
  const reset = () => {
    loading.value = false
    error.value = null
    data.value = null
    startTime.value = null
  }

  // 手动设置加载状态
  const setLoading = (value) => {
    loading.value = value
    if (value) {
      startTime.value = Date.now()
    } else {
      startTime.value = null
    }
  }

  // 手动设置错误
  const setError = (err) => {
    error.value = err
    loading.value = false
  }

  // 手动设置数据
  const setData = (value) => {
    data.value = value
    error.value = null
  }

  // 重试上次操作
  const retry = async () => {
    if (lastOperation) {
      return execute(lastOperation.operation, lastOperation.options)
    }
  }

  // 记录最后一次操作，用于重试
  let lastOperation = null
  const executeAndRemember = async (operation, options = {}) => {
    lastOperation = { operation, options }
    return execute(operation, options)
  }

  return {
    // 状态
    loading: isLoading,
    error,
    data,
    hasError,
    hasData,
    loadingTime,
    
    // 方法
    execute: executeAndRemember,
    reset,
    retry,
    setLoading,
    setError,
    setData
  }
}

// 专门用于列表操作的 Hook
export function useAsyncList(options = {}) {
  const {
    loading,
    error,
    data,
    execute,
    reset,
    retry,
    setData
  } = useAsyncOperation(options)

  const items = computed(() => data.value || [])
  const isEmpty = computed(() => items.value.length === 0)
  const total = ref(0)

  // 加载列表
  const loadList = async (fetcher, params = {}) => {
    return execute(async () => {
      const result = await fetcher(params)
      
      // 处理不同的返回格式
      if (result.data) {
        total.value = result.total || result.data.length
        return result.data
      }
      
      total.value = result.length || 0
      return result
    })
  }

  // 添加项目
  const addItem = (item) => {
    const currentItems = items.value
    setData([...currentItems, item])
    total.value = items.value.length
  }

  // 更新项目
  const updateItem = (id, updates) => {
    const currentItems = items.value
    const index = currentItems.findIndex(item => item._id === id || item.id === id)
    
    if (index !== -1) {
      const newItems = [...currentItems]
      newItems[index] = { ...newItems[index], ...updates }
      setData(newItems)
    }
  }

  // 删除项目
  const removeItem = (id) => {
    const currentItems = items.value
    const newItems = currentItems.filter(item => item._id !== id && item.id !== id)
    setData(newItems)
    total.value = newItems.length
  }

  // 批量操作
  const batchUpdate = (updates) => {
    const currentItems = items.value
    const newItems = currentItems.map(item => {
      const update = updates.find(u => (u.id === item._id || u.id === item.id))
      return update ? { ...item, ...update.data } : item
    })
    setData(newItems)
  }

  return {
    loading,
    error,
    items,
    total,
    isEmpty,
    loadList,
    addItem,
    updateItem,
    removeItem,
    batchUpdate,
    reset,
    retry
  }
}

// 专门用于表单操作的 Hook
export function useAsyncForm(options = {}) {
  const {
    loading,
    error,
    execute,
    reset
  } = useAsyncOperation({
    minLoadingTime: 800, // 表单提交稍长的加载时间
    ...options
  })

  const submitting = computed(() => loading.value)

  // 提交表单
  const submitForm = async (submitter, formData, options = {}) => {
    return execute(
      () => submitter(formData),
      {
        successMessage: '保存成功',
        errorMessage: '保存失败',
        ...options
      }
    )
  }

  // 删除确认
  const confirmDelete = async (deleter, item, options = {}) => {
    const { confirmAction } = useErrorHandler()
    
    const confirmed = await confirmAction(
      options.confirmMessage || `确定删除"${item.name || item.title || '此项'}"吗？`,
      '删除确认'
    )
    
    if (confirmed) {
      return execute(
        () => deleter(item._id || item.id),
        {
          successMessage: '删除成功',
          errorMessage: '删除失败',
          ...options
        }
      )
    }
    
    return false
  }

  return {
    submitting,
    error,
    submitForm,
    confirmDelete,
    reset
  }
}

// 使用示例导出
export const examples = {
  // 基础用法
  basic: `
    const { loading, error, data, execute } = useAsyncOperation();
    
    const fetchData = async () => {
      return execute(
        () => api.getData(),
        {
          successMessage: '获取成功',
          errorMessage: '获取失败'
        }
      );
    };
  `,
  
  // 列表操作
  list: `
    const { loading, items, isEmpty, loadList, addItem, updateItem, removeItem } = useAsyncList();
    
    // 加载列表
    await loadList(api.getItems, { page: 1, limit: 10 });
    
    // 添加项目
    addItem(newItem);
    
    // 更新项目
    updateItem(itemId, { name: 'new name' });
    
    // 删除项目
    removeItem(itemId);
  `,
  
  // 表单操作
  form: `
    const { submitting, submitForm, confirmDelete } = useAsyncForm();
    
    // 提交表单
    const handleSubmit = async () => {
      await submitForm(api.createItem, formData);
    };
    
    // 删除确认
    const handleDelete = async (item) => {
      await confirmDelete(api.deleteItem, item);
    };
  `
}