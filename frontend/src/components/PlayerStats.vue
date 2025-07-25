<template>
  <el-card class="card-section card-no-title player-stats" v-if="info">
    <p>{{ info.name }}　Lv.{{ info.lvl }}　EXP: {{ info.exp }}</p>
    <p>
      攻击力：{{ info.att }}　防御力：{{ info.def }}　
      <el-tooltip :content="fullProfText" placement="top">
        <span class="prof">熟练度：{{ highestProfText }}</span>
      </el-tooltip>
    </p>
    <p>金钱：{{ info.money }}</p>
    <p v-if="injuries && injuries !== '无'">受伤：{{ injuries }}</p>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  info: Object,
  injuries: String
})

const fullProfText = computed(() => {
  if (!props.info) return ''
  return `殴${props.info.wp} 斩${props.info.wk} 射${props.info.wg} 投${props.info.wc} 爆${props.info.wd} 灵${props.info.wf}`
})

const highestProfText = computed(() => {
  if (!props.info) return ''
  const fields = ['wp', 'wk', 'wg', 'wc', 'wd', 'wf']
  const labels = ['殴', '斩', '射', '投', '爆', '灵']
  let max = 0
  let idx = 0
  fields.forEach((f, i) => {
    const val = props.info[f] || 0
    if (val > max) {
      max = val
      idx = i
    }
  })
  return `${labels[idx]}${max}`
})
</script>

<style scoped>
.card-section {
  margin-bottom: 20px;
}
:deep(.card-no-title .el-card__header) {
  display: none;
}
.player-stats p {
  margin: 4px 0;
  text-align: left;
}
</style>
