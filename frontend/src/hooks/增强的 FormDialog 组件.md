<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="600px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      label-width="120px"
      :rules="formRules"
      @submit.prevent="handleSave"
    >
      <el-form-item
        v-for="field in fields"
        :key="field.name"
        :label="field.label"
        :prop="field.name"
        :error="errors[field.name]"
      >
        <!-- 文本输入 -->
        <el-input
          v-if="field.type === 'text'"
          v-model="form[field.name]"
          :placeholder="field.placeholder || `请输入${field.label}`"
          :maxlength="field.maxLength"
          :show-word-limit="!!field.maxLength"
          clearable
        />
        
        <!-- 数字输入 -->
        <el-input-number
          v-else-if="field.type === 'number'"
          v-model="form[field.name]"
          :min="field.min"
          :max="field.max"
          :step="field.step || 1"
          :precision="field.precision"
          style="width: 100%"
        />
        
        <!-- 下拉选择 -->
        <el-select
          v-else-if="field.type === 'select'"
          v-model="form[field.name]"
          :placeholder="field.placeholder || `请选择${field.label}`"
          clearable
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="option in field.options"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        
        <!-- 多选 -->
        <el-select
          v-else-if="field.type === 'multiselect'"
          v-model="form[field.name]"
          :placeholder="field.placeholder || `请选择${field.label}`"
          multiple
          clearable
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="option in field.options"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        
        <!-- 文本域 -->
        <el-input
          v-else-if="field.type === 'textarea'"
          v-model="form[field.name]"
          type="textarea"
          :rows="field.rows || 4"
          :placeholder="field.placeholder || `请输入${field.label}`"
          :maxlength="field.maxLength"
          :show-word-limit="!!field.maxLength"
        />
        
        <!-- 开关 -->
        <el-switch
          v-else-if="field.type === 'switch'"
          v-model="form[field.name]"
          :active-text="field.activeText || '是'"
          :inactive-text="field.inactiveText || '否'"
        />
        
        <!-- 日期选择 -->
        <el-date-picker
          v-else-if="field.type === 'date'"
          v-model="form[field.name]"
          type="date"
          :placeholder="field.placeholder || `请选择${field.label}`"
          style="width: 100%"
        />
        
        <!-- 时间选择 -->
        <el-time-picker
          v-else-if="field.type === 'time'"
          v-model="form[field.name]"
          :placeholder="field.placeholder || `请选择${field.label}`"
          style="width: 100%"
        />
        
        <!-- 默认文本输入 -->
        <el-input
          v-else
          v-model="form[field.name]"
          :placeholder="field.placeholder || `请输入${field.label}`"
          clearable
        />
        
        <!-- 字段说明 -->
        <div v-if="field.description" class="field-description">
          {{ field.description }}
        </div>
      </el-form-item>
    </el-form>
    
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose" :disabled="loading">
          取消
        </el-button>
        <el-button 
          type="primary" 
          @click="handleSave"
          :loading="loading"
          native-type="submit"
        >
          {{ loading ? '保存中...' : '保存' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    required: true
  },
  fields: {
    type: Array,
    required: true
  },
  form: {
    type: Object,
    required: true
  },
  errors: {
    type: Object,
    default: () => ({})
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'save', 'close'])

const formRef = ref()
const loading = ref(false)

// 生成表单验证规则
const formRules = computed(() => {
  const rules = {}
  
  props.fields.forEach(field => {
    const fieldRules = []
    
    // 必填验证
    if (field.required) {
      fieldRules.push({
        required: true,
        message: `${field.label}不能为空`,
        trigger: ['blur', 'change']
      })
    }
    
    // 长度验证
    if (field.minLength || field.maxLength) {
      fieldRules.push({
        min: field.minLength || 0,
        max: field.maxLength || Infinity,
        message: `${field.label}长度应在 ${field.minLength || 0} 到 ${field.maxLength || '∞'} 个字符之间`,
        trigger: ['blur', 'change']
      })
    }
    
    // 数字验证
    if (field.type === 'number') {
      fieldRules.push({
        type: 'number',
        message: `${field.label}必须是数字`,
        trigger: ['blur', 'change']
      })
      
      if (field.min !== undefined) {
        fieldRules.push({
          validator: (rule, value, callback) => {
            if (value !== null && value !== undefined && value < field.min) {
              callback(new Error(`${field.label}不能小于 ${field.min}`))
            } else {
              callback()
            }
          },
          trigger: ['blur', 'change']
        })
      }
      
      if (field.max !== undefined) {
        fieldRules.push({
          validator: (rule, value, callback) => {
            if (value !== null && value !== undefined && value > field.max) {
              callback(new Error(`${field.label}不能大于 ${field.max}`))
            } else {
              callback()
            }
          },
          trigger: ['blur', 'change']
        })
      }
    }
    
    // 邮箱验证
    if (field.type === 'email') {
      fieldRules.push({
        type: 'email',
        message: `${field.label}格式不正确`,
        trigger: ['blur', 'change']
      })
    }
    
    // 自定义验证器
    if (field.validator) {
      fieldRules.push({
        validator: field.validator,
        trigger: ['blur', 'change']
      })
    }
    
    if (fieldRules.length > 0) {
      rules[field.name] = fieldRules
    }
  })
  
  return rules
})

// 处理保存
const handleSave = async () => {
  if (!formRef.value) return
  
  try {
    loading.value = true
    
    // 表单验证
    await formRef.value.validate()
    
    // 触发保存事件
    emit('save')
  } catch (error) {
    // 验证失败，不执行保存
    console.log('Form validation failed:', error)
  } finally {
    loading.value = false
  }
}

// 处理关闭
const handleClose = () => {
  // 清除表单验证状态
  nextTick(() => {
    if (formRef.value) {
      formRef.value.clearValidate()
    }
  })
  
  emit('close')
}

// 监听对话框打开/关闭
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    // 对话框打开时，重置表单验证状态
    nextTick(() => {
      if (formRef.value) {
        formRef.value.clearValidate()
      }
    })
  }
})
</script>

<style scoped>
.field-description {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.el-form-item__error) {
  position: static;
  margin-top: 4px;
}
</style>