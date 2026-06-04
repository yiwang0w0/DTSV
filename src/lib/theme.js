/**
 * theme.js — DTSV / 远星函馆 全站统一主题 token（单一真源）
 *
 * GitHub-dark 基底。大厅 / 后台 / 档案 / 纪元档案 / 合同 / 对局 / BR 战场 全部共用本表，
 * 消除此前「大厅(蓝 #58a6ff) → 进对局(赛博青 #00d4ff)」的主色突变割裂（用户拍板：统一到一套 token）。
 *
 * 用法：调色在此一处改即全站生效——
 *   · gameUi.js 的 T 调色板按语义引用本表（T.cyan→accent / T.red→danger / T.green→success …）
 *   · layout / archive / codex / contracts / profile / PrepareModal 的本地 C 调色板同样引用本表
 *
 * 命名按「语义」而非「颜色」（accent/danger/success…），故全站换肤只需改本表的值。
 */
export const THEME = {
  // ── 背景层级（由深到浅）──
  bg:          '#0e1117', // 画布基底
  bgInset:     '#0d1117', // 略深内陷（输入框 / 进度槽底）
  panel:       '#161b22', // 面板 / 卡片
  panel2:      '#1c2128', // 抬升面板
  panel3:      '#21262d', // 更高抬升 / hover

  // ── 描边 ──
  border:      '#30363d',
  borderHover: '#444c56',

  // ── 文字 ──
  text:        '#e6edf3',
  dim:         '#8b949e', // 次级文字
  dim2:        '#6e7681', // 更次级
  dim3:        '#484f58', // 最弱 / 占位

  // ── 语义色 ──
  accent:      '#58a6ff', // 主强调（链接 / 选中 / 高亮）
  danger:      '#f85149', // 危险 / 致死 / 删除
  success:     '#3fb950', // 成功 / 存活 / 增益
  warning:     '#d29922', // 警告 / 黄字提示
  purple:      '#bc8cff', // 装备 / 稀有叙事
  orange:      '#f0883e', // 次警示 / 计数
}

export default THEME
