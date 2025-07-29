<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="600px"
    @close="$emit('close')"
  >
    <el-form label-width="80px">
      <el-form-item v-for="f in fields" :key="f.name" :label="f.label">
        <el-input
          v-if="f.type === 'text'"
          v-model="form[f.name]"
          :disabled="f.disabled"
        />
        <el-input-number
          v-else-if="f.type === 'number'"
          v-model="form[f.name]"
          :disabled="f.disabled"
        />
        <el-select
          v-else-if="f.type === 'select' || f.type === 'multiselect'"
          v-model="form[f.name]"
          :multiple="f.type === 'multiselect'"
          filterable
          :disabled="f.disabled"
        >
          <el-option
            v-for="op in f.options"
            :key="typeof op === 'object' ? op.value : op"
            :label="typeof op === 'object' ? op.label : op"
            :value="typeof op === 'object' ? op.value : op"
          />
        </el-select>
        <el-input v-else v-model="form[f.name]" :disabled="f.disabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="$emit('save')">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({
  modelValue: Boolean,
  title: String,
  fields: { type: Array, default: () => [] },
  form: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['update:modelValue', 'save', 'close']);
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});
</script>
