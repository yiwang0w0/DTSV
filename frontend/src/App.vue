<script setup>
import { computed } from 'vue'
import { token } from './store/user'
import { useRouter } from 'vue-router'

const router = useRouter()

const loggedIn = computed(() => !!token.value)
</script>

<template>
  <div class="dark-container">
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
    
    <div style="margin-top: 60px; width: 100%;">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
/* 暗色主题暂不默认启用，如需启用可在此处引入 */
/* @import './styles/dark-theme.css'; */

.dark-nav {
  display: flex;
  justify-content: center;
  background-color: #333; /* 可根据 dark-theme.css 调整 */
}

.el-menu-item {
  margin: 0 10px;
}
</style>