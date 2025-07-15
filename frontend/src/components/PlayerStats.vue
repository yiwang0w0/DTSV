<template>
  <el-card class="card-section card-no-title" v-if="info">
    <p>玩家名：{{ info.name }}</p>
    <p>攻击力：{{ info.att }}</p>
    <p>防御力：{{ info.def }}</p>
    <p>等级：{{ info.lvl }}</p>
    <p>经验值：{{ info.exp }}</p>
    <p>金钱：{{ info.money }}</p>
    <p>熟练度：殴{{ info.wp }} 斩{{ info.wk }} 射{{ info.wg }} 投{{ info.wc }} 爆{{ info.wd }} 灵{{ info.wf }}</p>
    <p>受伤：{{ injuries }}</p>
  </el-card>
</template>

<script setup>
defineProps({
  info: Object,
  injuries: String
})
</script>

<style scoped>
.card-section {
  margin-bottom: 20px;
}
:deep(.card-no-title .el-card__header) {
  display: none;
}
</style>
