<script setup>
import { computed } from 'vue'
import { token } from './store/user'
import { useRouter } from 'vue-router'

const router = useRouter()

const loggedIn = computed(() => !!token.value)
</script>


<template>
  <div>
    <el-menu mode="horizontal" class="nav">
      <el-menu-item index="home" @click="router.push('/')">首页</el-menu-item>
      <el-menu-item index="mail" @click="router.push('/mail')">站内邮件</el-menu-item>
      <el-menu-item index="profile" @click="router.push('/profile')">帐号资料</el-menu-item>
      <el-menu-item v-if="!loggedIn" index="game" @click="router.push('/')">进入游戏</el-menu-item>
      <el-menu-item v-else index="game" @click="router.push('/start')">进入游戏</el-menu-item>
      <el-menu-item index="status" @click="router.push('/status')">进行状况</el-menu-item>
      <el-menu-item index="alive" @click="router.push('/alive')">当前幸存</el-menu-item>
      <el-menu-item index="victory" @click="router.push('/victory')">历史优胜</el-menu-item>
      <el-menu-item index="ranking" @click="router.push('/ranking')">玩家排行</el-menu-item>
      <el-menu-item index="help" @click="router.push('/help')">游戏帮助</el-menu-item>
      <el-menu-item index="admin" @click="router.push('/admin')">游戏管理</el-menu-item>
    </el-menu>
    <router-view />
  </div>
</template>

