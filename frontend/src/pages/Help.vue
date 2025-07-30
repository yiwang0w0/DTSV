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
      <el-tab-pane label="代码对照" name="codes">
        <h3>物品种类代码</h3>
        <el-table :data="kindRows" border style="width: 100%">
          <el-table-column prop="code" label="代码" width="100" />
          <el-table-column prop="desc" label="含义" />
        </el-table>
        <h3 style="margin-top: 20px;">地图位置编号</h3>
        <el-table :data="areaRows" border style="width: 100%">
          <el-table-column prop="code" label="编号" width="80" />
          <el-table-column prop="name" label="区域名称" />
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

const kindRows = [
  { code: 'DN', desc: '内衣' },
  { code: 'DB', desc: '身体装备' },
  { code: 'DH', desc: '头部装备' },
  { code: 'DA', desc: '手臂装备' },
  { code: 'DF', desc: '腿部装备' },
  { code: 'A', desc: '饰物' },
  { code: 'Ag', desc: '同志饰物' },
  { code: 'Al', desc: '热恋饰物' },
  { code: 'N', desc: '无' },
  { code: 'X', desc: '合成专用' },
  { code: 'Y', desc: '特殊' },
  { code: 'Z', desc: '特殊(不可合并)' },
  { code: 'GB', desc: '手枪弹药' },
  { code: 'GBr', desc: '机枪弹药' },
  { code: 'GBi', desc: '气体弹药' },
  { code: 'GBh', desc: '重型弹药' },
  { code: 'GBe', desc: '能源弹药' },
  { code: 'WP', desc: '钝器' },
  { code: 'WK', desc: '锐器' },
  { code: 'WG', desc: '远程兵器' },
  { code: 'WJ', desc: '重型枪械' },
  { code: 'WF', desc: '灵力兵器' },
  { code: 'WD', desc: '爆炸物' },
  { code: 'WB', desc: '弓' },
  { code: 'WC', desc: '投掷兵器' },
  { code: 'WN', desc: '空手' }
]

const areaRows = [
  { code: 0, name: '无月之影' },
  { code: 1, name: '端点' },
  { code: 2, name: 'RF高校' },
  { code: 3, name: '雪之镇' },
  { code: 4, name: '索拉利斯' },
  { code: 5, name: '指挥中心' },
  { code: 6, name: '梦幻馆' },
  { code: 7, name: '清水池' },
  { code: 8, name: '白穗神社' },
  { code: 9, name: '墓地' },
  { code: 10, name: '麦斯克林' },
  { code: 11, name: '对天使用作战本部' },
  { code: 12, name: '夏之镇' },
  { code: 13, name: '三体星' },
  { code: 14, name: '光坂高校' },
  { code: 15, name: '守矢神社' },
  { code: 16, name: '常磐森林' },
  { code: 17, name: '常磐台中学' },
  { code: 18, name: '秋之镇' },
  { code: 19, name: '精灵中心' },
  { code: 20, name: '春之镇' },
  { code: 21, name: '圣Gradius学园' },
  { code: 22, name: '初始之树' },
  { code: 23, name: '幻想世界' },
  { code: 24, name: '永恒的世界' },
  { code: 25, name: '妖精驿站' },
  { code: 26, name: '冰封墓场' },
  { code: 27, name: '花菱商厦' },
  { code: 28, name: 'FARGO前基地' },
  { code: 29, name: '风祭森林' },
  { code: 30, name: '天使队移动格纳库' },
  { code: 31, name: '和田町研究所' },
  { code: 32, name: 'ＳＣＰ研究设施' },
  { code: 33, name: '雏菊之丘' },
  { code: 34, name: '英灵殿' }
]
</script>

<style scoped>
@import '../styles/dark-theme.css';
.page {
  padding: 20px;
}
</style>
