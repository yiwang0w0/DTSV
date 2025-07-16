<template>
  <el-card class="card-section card-no-title" v-if="rows && rows.length">
    <el-table :data="rows" size="small" style="width: 100%">
      <el-table-column prop="slot" label="装备种类" width="80" />
      <el-table-column prop="name" label="装备名称" />
      <el-table-column prop="attr" label="属性" width="80" />
      <el-table-column prop="effect" label="效果" width="80" />
      <el-table-column prop="dur" label="耐久" width="80" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" @click="$emit('unequip', row.field)" :disabled="!row.name">卸下</el-button>
          <el-button size="small" @click="$emit('drop', row.field)" :disabled="!row.name">丢弃</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
defineProps({
  rows: Array
})
defineEmits(['unequip','drop'])
</script>

<style scoped>
.card-section {
  margin-bottom: 20px;
}
:deep(.card-no-title .el-card__header) {
  display: none;
}
</style>
