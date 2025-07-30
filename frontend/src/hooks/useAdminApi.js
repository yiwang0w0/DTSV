import { ref, computed } from 'vue'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta } from '../api'
import { useApiCache } from './useApiCache'
import { useErrorHandler } from './useErrorHandler'

export function useAdminApi(collection) {
  const cache = useApiCache()
  const { handleError, handleSuccess } = useErrorHandler()
  
  const items = ref([])
  const fieldMeta = ref([])
  const loading = ref(false)
  const skip = ref(0)
  const limit = 50
  const allLoaded = ref(false)

  // 缓存键生成
  const getCacheKey = (type, params = {}) => {
    return `${collection.value}_${type}_${JSON.stringify(params)}`
  }

  // 获取字段元数据（带缓存）
  const fetchFieldMeta = async (force = false) => {
    if (!collection.value) return

    const cacheKey = getCacheKey('fieldMeta')
    
    if (!force) {
      const cached = cache.get(cacheKey)
      if (cached) {
        fieldMeta.value = cached
        return cached
      }
    }

    try {
      loading.value = true
      const { data } = await adminFieldMeta(collection.value)
      
      // 处理特殊字段选项
      const processedData = data.map(f => {
        const nf = { ...f }
        // 这里可以添加字段处理逻辑
        return nf
      })
      
      fieldMeta.value = processedData
      cache.set(cacheKey, processedData)
      return processedData
    } catch (error) {
      handleError(error, '获取字段信息失败')
      fieldMeta.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  // 获取数据列表（带缓存和分页）
  const fetchItems = async (params = {}, append = false, force = false) => {
    if (!collection.value || (loading.value && !force) || (allLoaded.value && append)) return

    const requestParams = {
      skip: append ? skip.value : 0,
      limit,
      ...params
    }
    
    const cacheKey = getCacheKey('items', requestParams)
    
    if (!force && !append) {
      const cached = cache.get(cacheKey)
      if (cached) {
        items.value = cached.items
        skip.value = cached.skip
        allLoaded.value = cached.allLoaded
        return cached.items
      }
    }

    try {
      loading.value = true
      const { data } = await adminList(collection.value, requestParams)
      
      const newItems = append ? [...items.value, ...data] : data
      items.value = newItems
      
      if (data.length < limit) {
        allLoaded.value = true
      }
      
      skip.value = append ? skip.value + data.length : data.length

      // 缓存结果
      if (!append) {
        cache.set(cacheKey, {
          items: newItems,
          skip: skip.value,
          allLoaded: allLoaded.value
        })
      }

      return newItems
    } catch (error) {
      handleError(error, '获取数据失败')
      return []
    } finally {
      loading.value = false
    }
  }

  // 创建项目
  const createItem = async (data) => {
    try {
      loading.value = true
      await adminCreate(collection.value, data)
      handleSuccess('创建成功')
      
      // 清除相关缓存
      cache.invalidate(collection.value)
      
      // 重新获取数据
      reset()
      await fetchItems()
      
      return true
    } catch (error) {
      handleError(error, '创建失败')
      return false
    } finally {
      loading.value = false
    }
  }

  // 更新项目
  const updateItem = async (id, data) => {
    try {
      loading.value = true
      await adminUpdate(collection.value, id, data)
      handleSuccess('更新成功')
      
      // 清除相关缓存
      cache.invalidate(collection.value)
      
      // 重新获取数据
      reset()
      await fetchItems()
      
      return true
    } catch (error) {
      handleError(error, '更新失败')
      return false
    } finally {
      loading.value = false
    }
  }

  // 删除项目
  const deleteItem = async (id) => {
    try {
      loading.value = true
      await adminDelete(collection.value, id)
      handleSuccess('删除成功')
      
      // 清除相关缓存
      cache.invalidate(collection.value)
      
      // 重新获取数据
      reset()
      await fetchItems()
      
      return true
    } catch (error) {
      handleError(error, '删除失败')
      return false
    } finally {
      loading.value = false
    }
  }

  // 重置状态
  const reset = () => {
    items.value = []
    skip.value = 0
    allLoaded.value = false
  }

  // 加载更多
  const loadMore = () => {
    if (!allLoaded.value && !loading.value) {
      fetchItems({}, true)
    }
  }

  return {
    items,
    fieldMeta,
    loading,
    allLoaded,
    fetchFieldMeta,
    fetchItems,
    createItem,
    updateItem,
    deleteItem,
    loadMore,
    reset
  }
}