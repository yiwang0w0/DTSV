<template>
  <el-container class="admin-layout">
    <!-- 顶部导航 -->
    <el-header class="admin-header">
      <div class="header-left">
        <h1 class="system-title">
          <el-icon><Setting /></el-icon>
          DTS 管理系统
        </h1>
      </div>
      <div class="header-right">
        <el-space>
          <el-tooltip content="刷新">
            <el-button :icon="Refresh" circle @click="refresh" />
          </el-tooltip>
          <el-tooltip content="全屏">
            <el-button :icon="FullScreen" circle @click="toggleFullscreen" />
          </el-tooltip>
          <el-dropdown @command="handleCommand">
            <el-avatar :size="32" :src="userAvatar">{{ userName }}</el-avatar>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人设置</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-space>
      </div>
    </el-header>

    <el-container>
      <!-- 侧边栏 -->
      <el-aside class="admin-aside" :width="isCollapse ? '64px' : '240px'">
        <div class="aside-toggle">
          <el-button
            text
            :icon="isCollapse ? Expand : Fold"
            @click="toggleSidebar"
          />
        </div>
        
        <el-menu
          :default-active="activeMenu"
          :collapse="isCollapse"
          :unique-opened="true"
          router
          class="admin-menu"
        >
          <el-menu-item index="/admin" route="/admin">
            <el-icon><Grid /></el-icon>
            <template #title>数据管理</template>
          </el-menu-item>
          
          <el-sub-menu index="items">
            <template #title>
              <el-icon><Box /></el-icon>
              <span>物品管理</span>
            </template>
            <el-menu-item index="/admin/items">物品列表</el-menu-item>
            <el-menu-item index="/admin/itemcategories">物品分类</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="map">
            <template #title>
              <el-icon><Location /></el-icon>
              <span>地图管理</span>
            </template>
            <el-menu-item index="/admin/mapresources">地图资源</el-menu-item>
            <el-menu-item index="/admin/areas">区域管理</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="game">
            <template #title>
              <el-icon><User /></el-icon>
              <span>游戏管理</span>
            </template>
            <el-menu-item index="/admin/players">玩家管理</el-menu-item>
            <el-menu-item index="/admin/npcs">NPC管理</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-aside>

      <!-- 主内容区 -->
      <el-main class="admin-main">
        <div class="content-wrapper">
          <slot />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  Setting, Refresh, FullScreen, Expand, Fold,
  Grid, Box, Location, User
} from '@element-plus/icons-vue'

const route = useRoute()
const isCollapse = ref(false)
const userName = ref('管理员')
const userAvatar = ref('')

const activeMenu = computed(() => route.path)

const toggleSidebar = () => {
  isCollapse.value = !isCollapse.value
}

const refresh = () => {
  window.location.reload()
}

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

const handleCommand = (command) => {
  if (command === 'logout') {
    // 退出登录逻辑
  } else if (command === 'profile') {
    // 个人设置逻辑
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
}

.admin-header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
}

.system-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.admin-aside {
  background: #fff;
  border-right: 1px solid #e4e7ed;
  transition: width 0.3s;
}

.aside-toggle {
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
  text-align: center;
}

.admin-menu {
  border-right: none;
  background: transparent;
}

.admin-main {
  background: #f5f7fa;
  padding: 0;
}

.content-wrapper {
  height: 100%;
  overflow: auto;
}
</style>
