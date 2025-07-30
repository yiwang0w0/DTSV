<script setup>
import { computed } from 'vue'
import { token } from './store/user'
import { useRouter } from 'vue-router'

const router = useRouter()

const loggedIn = computed(() => !!token.value)
</script>

<template>
  <div class="app-dark">
    <el-menu mode="horizontal" class="dark-nav">
      <el-menu-item index="home" @click="router.push('/')">首页</el-menu-item>
      <el-menu-item index="profile" @click="router.push('/profile')">帐号资料</el-menu-item>
      <el-menu-item v-if="!loggedIn" index="game" @click="router.push('/')">进入游戏</el-menu-item>
      <el-menu-item v-else index="game" @click="router.push('/start')">进入游戏</el-menu-item>
      <el-menu-item index="status" @click="router.push('/status')">进行状况</el-menu-item>
      <el-menu-item index="victory" @click="router.push('/victory')">历史优胜</el-menu-item>
      <el-menu-item index="help" @click="router.push('/help')">游戏帮助</el-menu-item>
      <el-menu-item index="admin" @click="router.push('/admin')">游戏管理</el-menu-item>
    </el-menu>
    <router-view />
  </div>
</template>

<style>
/* 全局暗色主题 */
html, body {
  margin: 0;
  padding: 0;
  background: #0a0f1c !important;
  color: #e0e6ed !important;
  font-family: 'Microsoft YaHei', 'Courier New', monospace;
  min-height: 100vh;
}

#app {
  background: #0a0f1c !important;
  color: #e0e6ed !important;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  max-width: none;
  text-align: left;
}

.app-dark {
  background: #0a0f1c;
  color: #e0e6ed;
  min-height: 100vh;
}

/* 暗色导航栏 */
.dark-nav {
  background: rgba(0, 0, 0, 0.8) !important;
  border-bottom: 1px solid #333 !important;
  backdrop-filter: blur(10px);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  z-index: 1000;
  border-right: none !important;
}

.dark-nav .el-menu-item {
  background-color: transparent !important;
  color: #888 !important;
  border-bottom: 2px solid transparent !important;
  font-family: 'Microsoft YaHei', sans-serif;
  font-size: 0.9rem;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.dark-nav .el-menu-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 255, 65, 0.1), transparent);
  transition: left 0.5s;
}

.dark-nav .el-menu-item:hover::before {
  left: 100%;
}

.dark-nav .el-menu-item:hover {
  background-color: rgba(0, 255, 65, 0.05) !important;
  color: #00ff41 !important;
}

.dark-nav .el-menu-item.is-active {
  background-color: rgba(0, 255, 65, 0.1) !important;
  color: #00ff41 !important;
  border-bottom-color: #00ff41 !important;
  box-shadow: 0 0 10px rgba(0, 255, 65, 0.2);
}

/* 主内容区域调整 */
.app-dark > div:last-child {
  margin-top: 60px;
  background: #0a0f1c;
  min-height: calc(100vh - 60px);
}

/* 页面容器样式 */
.page {
  background: #0a0f1c !important;
  color: #e0e6ed !important;
  padding: 20px;
  min-height: calc(100vh - 60px);
}

/* Element Plus 组件暗色主题覆盖 */
.el-input__wrapper {
  background-color: rgba(0, 0, 0, 0.5) !important;
  border: 1px solid #444 !important;
  color: #fff !important;
  border-radius: 4px;
}

.el-input__wrapper:hover {
  border-color: #00ff41 !important;
}

.el-input__wrapper.is-focus {
  border-color: #00ff41 !important;
  box-shadow: 0 0 5px rgba(0, 255, 65, 0.3) !important;
}

.el-input__inner {
  color: #fff !important;
  background: transparent !important;
}

.el-input__inner::placeholder {
  color: #666 !important;
}

.el-button {
  background: transparent !important;
  border: 1px solid #444 !important;
  color: #888 !important;
  transition: all 0.3s ease;
}

.el-button:hover {
  border-color: #00ff41 !important;
  color: #00ff41 !important;
  background: rgba(0, 255, 65, 0.05) !important;
}

.el-button--primary {
  background: rgba(0, 255, 65, 0.1) !important;
  border-color: #00ff41 !important;
  color: #00ff41 !important;
}

.el-button--primary:hover {
  background: rgba(0, 255, 65, 0.2) !important;
  border-color: #00ff41 !important;
  color: #00ff41 !important;
}

.el-card {
  background: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid #333 !important;
  color: #e0e6ed !important;
  backdrop-filter: blur(5px);
}

.el-card__header {
  background: rgba(0, 0, 0, 0.3) !important;
  border-bottom: 1px solid #333 !important;
  color: #00ff41 !important;
  font-weight: bold;
}

.el-card__body {
  background: transparent !important;
  color: #e0e6ed !important;
}

.el-table {
  background: rgba(0, 0, 0, 0.4) !important;
  color: #e0e6ed !important;
}

.el-table th.el-table__cell {
  background: rgba(0, 0, 0, 0.6) !important;
  color: #00ff41 !important;
  border-bottom: 1px solid #333 !important;
}

.el-table td.el-table__cell {
  background: transparent !important;
  color: #e0e6ed !important;
  border-bottom: 1px solid #333 !important;
}

.el-table tr:hover > td {
  background: rgba(0, 255, 65, 0.05) !important;
}

.el-table__empty-block {
  background: transparent !important;
  color: #888 !important;
}

.el-table__empty-text {
  color: #888 !important;
}

.el-tabs__header {
  background: transparent !important;
}

.el-tabs__nav-wrap::after {
  background: #333 !important;
}

.el-tabs__item {
  color: #888 !important;
}

.el-tabs__item:hover {
  color: #00ff41 !important;
}

.el-tabs__item.is-active {
  color: #00ff41 !important;
}

.el-tabs__active-bar {
  background: #00ff41 !important;
}

.el-form-item__label {
  color: #888 !important;
}

.el-select .el-input__wrapper {
  background-color: rgba(0, 0, 0, 0.5) !important;
  border: 1px solid #444 !important;
}

.el-select-dropdown {
  background: rgba(0, 0, 0, 0.9) !important;
  border: 1px solid #333 !important;
  backdrop-filter: blur(10px);
}

.el-select-dropdown__item {
  color: #e0e6ed !important;
}

.el-select-dropdown__item:hover {
  background: rgba(0, 255, 65, 0.1) !important;
  color: #00ff41 !important;
}

.el-select-dropdown__item.selected {
  background: rgba(0, 255, 65, 0.2) !important;
  color: #00ff41 !important;
}

.el-progress-bar__outer {
  background: rgba(0, 0, 0, 0.3) !important;
}

.el-progress-bar__inner {
  background: linear-gradient(90deg, #00ff41, #00aa33) !important;
}

.el-dialog {
  background: rgba(0, 0, 0, 0.9) !important;
  border: 1px solid #333 !important;
  backdrop-filter: blur(10px);
}

.el-dialog__header {
  background: rgba(0, 0, 0, 0.3) !important;
  border-bottom: 1px solid #333 !important;
}

.el-dialog__title {
  color: #00ff41 !important;
}

.el-dialog__body {
  background: transparent !important;
  color: #e0e6ed !important;
}

.el-overlay {
  background: rgba(0, 0, 0, 0.8) !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .dark-nav .el-menu-item {
    font-size: 0.8rem;
    padding: 0 12px;
  }
  
  .page {
    padding: 15px;
  }
}
</style>