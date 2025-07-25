<template>
  <div class="page">
    <h2>欢迎来到 DTS</h2>
    <div class="home-container">
      <div class="game-info">
        <p>游戏版本：{{ gameInfo.version ?? '未知' }}</p>
        <p>当前时刻：{{ formatTime(currentTime) }}</p>
        <p>状态：{{ gameStatus }}</p>
        <p>已运行：{{ runtime }}</p>
        <p>禁区数：{{ gameInfo.areanum ?? '无法获取' }}</p>
        <p>存活玩家：{{ gameInfo.alivenum ?? '无法获取' }}</p>
        <p>死亡总数：{{ gameInfo.deathnum ?? '无法获取' }}</p>
        <div class="btn-group">
          <el-button size="small" type="primary" @click="manualStart">手动开始游戏</el-button>
          <el-button size="small" type="danger" @click="manualStop" style="margin-left: 8px">手动关闭游戏</el-button>
        </div>
      </div>
      <div v-if="!loggedIn" class="auth-box">
        <el-tabs v-model="activeTab" stretch>
          <el-tab-pane label="登录" name="login">
            <el-form @submit.prevent="login">
            <el-form-item label="用户名">
              <el-input v-model="loginForm.username" autocomplete="off" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input type="password" v-model="loginForm.password" autocomplete="off" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="login">登录</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="注册" name="register">
          <el-form @submit.prevent="register">
            <el-form-item label="用户名">
              <el-input v-model="registerForm.username" placeholder="用户名" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input type="password" v-model="registerForm.password" placeholder="密码" />
            </el-form-item>
            <el-form-item>
              <el-button @click="register">注册</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        </el-tabs>
      </div>
      <div v-else class="welcome">
        <p>已登录：{{ user }}</p>
        <el-button type="primary" @click="logout">退出登录</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onUnmounted } from 'vue'
import {
  login as loginApi,
  register as registerApi,
  getGameInfo,
  startGame,
  stopGame,
  logout as logoutApi,
} from '../api'
import { user, token, refreshToken, playerId } from '../store/user'
import { playerInfo } from '../store/player'
import { logs } from '../store/logs'

const gameInfo = ref({})
const currentTime = ref(Date.now())

const loginForm = reactive({ username: '', password: '' })
const registerForm = reactive({ username: '', password: '' })
const activeTab = ref('login')

const loggedIn = computed(() => !!token.value)

function formatTime(t) {
  return new Date(t).toLocaleString()
}

const gameStatus = computed(() => {
  if (!Object.keys(gameInfo.value).length) return '无法获取'
  const state = gameInfo.value.gamestate
  if (state >= 30) return '锁定'
  if (state >= 20) return '进行中'
  if (state > 0) return '未开始'
  return '已结束'
})

const runtime = computed(() => {
  if (!gameInfo.value?.starttime) return 'N/A'
  const diff = currentTime.value - gameInfo.value.starttime * 1000
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return `${h}小时${m}分${s}秒`
})

async function fetchGameInfo() {
  try {
    const { data } = await getGameInfo()
    gameInfo.value = data || {}
  } catch (e) {
    console.error(e)
    gameInfo.value = {}
  }
}

let timeTimer
let infoTimer
onMounted(() => {
  fetchGameInfo()
  timeTimer = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
  infoTimer = setInterval(fetchGameInfo, 5000)
})

onUnmounted(() => {
  clearInterval(timeTimer)
  clearInterval(infoTimer)
})

async function manualStart() {
  try {
    await startGame()
    fetchGameInfo()
  } catch (e) {
    alert(e.response?.data?.msg || '操作失败')
  }
}

async function manualStop() {
  try {
    await stopGame()
    fetchGameInfo()
    playerId.value = ''
    playerInfo.value = null
    logs.value = []
    localStorage.removeItem('playerId')
  } catch (e) {
    alert(e.response?.data?.msg || '操作失败')
  }
}

async function login() {
  if (!loginForm.username || !loginForm.password) return
  try {
    const { data } = await loginApi(loginForm.username, loginForm.password)
    user.value = data.username
    token.value = data.token
    refreshToken.value = data.refreshToken
    localStorage.setItem('user', user.value)
    localStorage.setItem('token', token.value)
    localStorage.setItem('refreshToken', refreshToken.value)
    // reset player related info
    playerId.value = ''
    playerInfo.value = null
    logs.value = []
    localStorage.removeItem('playerId')
  } catch (e) {
    alert(e.response?.data?.msg || '登录失败')
  }
}

async function register() {
  if (!registerForm.username || !registerForm.password) return
  try {
    const { data } = await registerApi(registerForm.username, registerForm.password)
    user.value = data.username
    token.value = data.token
    refreshToken.value = data.refreshToken
    localStorage.setItem('user', user.value)
    localStorage.setItem('token', token.value)
    localStorage.setItem('refreshToken', refreshToken.value)
    playerId.value = ''
    playerInfo.value = null
    logs.value = []
    localStorage.removeItem('playerId')
  } catch (e) {
    alert(e.response?.data?.msg || '注册失败')
  }
}

async function logout() {
  try {
    if (refreshToken.value)
      await logoutApi(refreshToken.value)
  } catch (e) {
    // ignore
  }
  user.value = ''
  token.value = ''
  refreshToken.value = ''
  playerId.value = ''
  playerInfo.value = null
  logs.value = []
  localStorage.removeItem('user')
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('playerId')
}
</script>

<style scoped>
.page { padding: 20px; }
.home-container {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.auth-box {
  max-width: 400px;
  margin: 0 auto;
}
.welcome {
  margin-top: 20px;
}
.game-info {
  margin-bottom: 20px;
}
.btn-group {
  margin-top: 10px;
}
@media (max-width: 600px) {
  .home-container {
    flex-direction: column;
  }
}
</style>
