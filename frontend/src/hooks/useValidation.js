export function useValidation() {
  const rules = {
    required: (value, message = '此字段为必填项') => {
      return value !== null && value !== undefined && value !== '' ? true : message
    },
    
    minLength: (min, message) => (value) => {
      return !value || value.length >= min ? true : message || `最少需要${min}个字符`
    },
    
    maxLength: (max, message) => (value) => {
      return !value || value.length <= max ? true : message || `最多允许${max}个字符`
    },
    
    number: (value, message = '必须是有效数字') => {
      return value === '' || value === null || !isNaN(Number(value)) ? true : message
    },
    
    positiveNumber: (value, message = '必须是正数') => {
      return value === '' || value === null || (Number(value) > 0) ? true : message
    },
    
    email: (value, message = '邮箱格式不正确') => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return !value || emailRegex.test(value) ? true : message
    }
  }

  const validate = (value, validationRules) => {
    for (const rule of validationRules) {
      const result = typeof rule === 'function' ? rule(value) : rule
      if (result !== true) {
        return result // 返回错误信息
      }
    }
    return true
  }

  const validateForm = (formData, fieldRules) => {
    const errors = {}
    let isValid = true

    for (const [field, rules] of Object.entries(fieldRules)) {
      const result = validate(formData[field], rules)
      if (result !== true) {
        errors[field] = result
        isValid = false
      }
    }

    return { isValid, errors }
  }

  return {
    rules,
    validate,
    validateForm
  }
}