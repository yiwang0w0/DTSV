<template>
  <el-card class="card-section card-no-title" v-if="enemy && player">
    <div class="battle-panel">
      <div class="side">
        <p>{{ player.name }}</p>
        <p>等级：{{ player.lvl }}</p>
        <p>生命：{{ player.hp }}/{{ player.mhp }}</p>
        <p>武器：{{ player.wep || '无' }}</p>
        <p>武器攻击：{{ player.wepe || 0 }}</p>
      </div>
      <div class="side">
        <p>{{ enemy.type > 0 ? 'NPC' : '玩家' }}：{{ enemy.name }}</p>
        <p>等级：{{ enemy.lvl ?? '?' }}</p>
        <p>生命：{{ enemyHpLabel }}</p>
        <p>武器：{{ enemy.wep || '未知' }}</p>
        <p>武器攻击：{{ enemy.wepe ?? 0 }}</p>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  player: Object,
  enemy: Object
})
const enemyHpLabel = computed(() => {
  if (!props.enemy || props.enemy.mhp === undefined) return '?' 
  const ratio = props.enemy.mhp ? props.enemy.hp / props.enemy.mhp : 0
  if (ratio > 0.88) return '近满'
  if (ratio > 0.66) return '约七成'
  if (ratio > 0.44) return '约半血'
  if (ratio > 0.22) return '不足半血'
  if (ratio > 0.1) return '濒危'
  return '濒死'
})
</script>

<style scoped>
.battle-panel {
  display: flex;
  justify-content: space-between;
}
.side {
  flex: 1;
}
.card-section {
  margin-bottom: 20px;
}
:deep(.card-no-title .el-card__header) {
  display: none;
}
</style>
