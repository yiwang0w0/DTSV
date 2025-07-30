import { ElMessage, ElMessageBox } from 'element-plus'

export function useErrorHandler() {
  const handleError = (error, customMessage = null) => {
    console.error('API Error:', error)
    
    const message = customMessage || 
      error.response?.data?.msg || 
      error.message || 
      '操作失败，请稍后重试'
    
    // 根据错误类型显示不同的提示
    if (error.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      // 可以在这里触发重新登录逻辑
    } else if (error.response?.status === 403) {
      ElMessage.error('权限不足')
    } else if (error.response?.status >= 500) {
      ElMessage.error('服务器错误，请联系管理员')
    } else {
      ElMessage.error(message)
    }
  }

  const handleSuccess = (message = '操作成功') => {
    ElMessage.success(message)
  }

  const confirmAction = async (message = '确定执行此操作？', title = '确认') => {
    try {
      await ElMessageBox.confirm(message, title, {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
      return true
    } catch {
      return false
    }
  }

  return {
    handleError,
    handleSuccess,
    confirmAction
  }
}
