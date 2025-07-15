<template>
  <div class="page">
    <el-tabs v-model="active">
      <el-tab-pane label="游戏说明" name="intro">
        <p>这里是游戏的基本说明，敬请参考原作文档。</p>
      </el-tab-pane>
      <el-tab-pane label="字段解释" name="fields">
        <p>以下字段在掉落物品表中经常出现，含义如下：</p>
        <el-table :data="fieldRows" border style="width: 100%">
          <el-table-column prop="field" label="字段" width="120" />
          <el-table-column prop="desc" label="含义" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="其他" name="other">
        <p>其他帮助内容敬请期待。</p>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const active = ref('intro')

const fieldRows = [
  { field: 'ID', desc: '道具编号，对应物品的唯一标识' },
  { field: '道具名', desc: '物品名称' },
  { field: '种类', desc: '物品类型代码，例如 WP 为钝器武器' },
  { field: '效果值', desc: '道具的攻击力或回复量等数值' },
  { field: '次数/耐久', desc: '可使用次数或装备耐久度' },
  { field: '属性', desc: '道具附加属性或特效标识' },
  { field: '所在区域', desc: '该道具出现的地图位置编号' }
]
</script>

<style scoped>
.page {
  padding: 20px;
}
</style>
