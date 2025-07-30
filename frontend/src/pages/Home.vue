<template>
  <div class="dts-terminal">
    <!-- 深色科技背景 -->
    <div class="terminal-background">
      <div class="matrix-rain">
        <div v-for="i in 20" :key="i" class="rain-column" :style="getRainStyle(i)"></div>
      </div>
      <div class="circuit-pattern"></div>
    </div>

    <!-- 主界面内容 -->
    <div class="terminal-content">
      <!-- 顶部标题栏 -->
      <header class="system-header">
        <div class="header-left">
          <div class="system-logo">
            <span class="logo-skull">💀</span>
            <div class="logo-text">
              <h1 class="system-name">DTS 大逃杀</h1>
              <p class="system-desc">Death Tournament Survival</p>
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="system-time">
            <span class="time-label">系统时间:</span>
            <span class="time-value">{{ formatTime(currentTime) }}</span>
          </div>
          <div class="system-status" :class="getSystemStatusClass()">
            <span class="status-dot"></span>
            <span>{{ gameStatus }}</span>
          </div>
        </div>
      </header>

      <!-- 主要信息面板 -->
      <main class="main-panels">
        <!-- 左侧信息栏 -->
        <div class="left-info-panel">
          <!-- 当前状态 -->
          <div class="info-section">
            <div class="section-title">当前状态:</div>
            <div class="status-grid">
              <div class="status-line">
                <span class="label">游戏版本:</span>
                <span class="value">{{ gameInfo.version ?? 'Unknown' }}</span>
              </div>
              <div class="status-line">
                <span class="label">运行时长:</span>
                <span class="value">{{ runtime }}</span>
              </div>
              <div class="status-line">
                <span class="label">服务器:</span>
                <span class="value">主服务器</span>
              </div>
            </div>
          </div>

          <!-- 系统状况 -->
          <div class="info-section">
            <div class="section-title">系统状况:</div>
            <div class="status-grid">
              <div class="status-line">
                <span class="label">游戏状态:</span>
                <span class="value" :class="getGameStateTextClass()">{{ gameStatus }}</span>
              </div>
              <div class="status-line">
                <span class="label">危险区域:</span>
                <span class="value danger">{{ gameInfo.areanum ?? 'N/A' }}</span>
              </div>
              <div class="status-line">
                <span class="label">存活玩家:</span>
                <span class="value success">{{ gameInfo.alivenum ?? 'N/A' }}</span>
              </div>
              <div class="status-line">
                <span class="label">死亡总数:</span>
                <span class="value warning">{{ gameInfo.deathnum ?? 'N/A' }}</span>
              </div>
            </div>
          </div>

          <!-- 游戏信息 -->
          <div class="info-section">
            <div class="section-title">游戏信息:</div>
            <div class="game-info-text">
              <p>这里是经典版IF，适合海外玩家</p>
              <p>多备注1.0版本，稳定子版本</p>
              <p>当前最高房是 {{ gameInfo.alivenum ?? 0 }} 人</p>
              <div class="game-alerts">
                <div class="alert-line danger">注意：进入特斗后，首先观察四周再行动。</div>
                <div class="alert-line warning">禁区间隔时间：40分钟，2禁后停止激活</div>
                <div class="alert-line info">每次增加禁区：4个，当前禁区数：{{ gameInfo.areanum ?? 0 }}</div>
              </div>
            </div>
          </div>

          <!-- 管理员控制 -->
          <div v-if="loggedIn" class="info-section admin-section">
            <div class="section-title">管理员控制:</div>
            <div class="admin-controls">
              <button class="admin-btn start-btn" @click="manualStart">
                <span class="btn-icon">▶</span>
                启动游戏
              </button>
              <button class="admin-btn stop-btn" @click="manualStop">
                <span class="btn-icon">⏹</span>
                停止游戏
              </button>
            </div>
          </div>
        </div>

        <!-- 右侧认证面板 -->
        <div class="right-auth-panel">
          <div v-if="!loggedIn" class="auth-container">
            <div class="auth-terminal">
              <div class="terminal-header">
                <div class="terminal-title">ACCESS CONTROL</div>
                <div class="terminal-indicator">
                  <span class="indicator-dot"></span>
                  <span>SECURE</span>
                </div>
              </div>

              <div class="auth-tabs">
                <button 
                  class="auth-tab" 
                  :class="{ active: activeTab === 'login' }"
                  @click="activeTab = 'login'"
                >
                  用户登录
                </button>
                <button 
                  class="auth-tab" 
                  :class="{ active: activeTab === 'register' }"
                  @click="activeTab = 'register'"
                >
                  新用户注册
                </button>
              </div>

              <div class="auth-form">
                <div v-if="activeTab === 'login'" class="form-panel">
                  <div class="input-group">
                    <label class="input-label">账号:</label>
                    <input 
                      v-model="loginForm.username" 
                      type="text" 
                      class="terminal-input"
                      placeholder="输入用户名"
                      autocomplete="off"
                    />
                  </div>
                  <div class="input-group">
                    <label class="input-label">密码:</label>
                    <input 
                      v-model="loginForm.password" 
                      type="password" 
                      class="terminal-input"
                      placeholder="输入密码"
                      autocomplete="off"
                      @keyup.enter="login"
                    />
                  </div>
                  <button class="auth-submit-btn" @click="login">
                    <span class="btn-text">登录</span>
                    <span class="btn-arrow">►</span>
                  </button>
                </div>

                <div v-if="activeTab === 'register'" class="form-panel">
                  <div class="input-group">
                    <label class="input-label">账号:</label>
                    <input 
                      v-model="registerForm.username" 
                      type="text" 
                      class="terminal-input"
                      placeholder="创建用户名"
                      autocomplete="off"
                    />
                  </div>
                  <div class="input-group">
                    <label class="input-label">密码:</label>
                    <input 
                      v-model="registerForm.password" 
                      type="password" 
                      class="terminal-input"
                      placeholder="设置密码"
                      autocomplete="off"
                      @keyup.enter="register"
                    />
                  </div>
                  <button class="auth-submit-btn register" @click="register">
                    <span class="btn-text">注册</span>
                    <span class="btn-arrow">►</span>
                  </button>
                </div>
              </div>

              <div class="auth-footer">
                <p class="first-time-tip">第一次玩的，请先看 <a href="/help" class="help-link">游戏帮助</a> !!!</p>
              </div>
            </div>
          </div>

          <div v-else class="user-panel">
            <div class="user-terminal">
              <div class="user-header">
                <div class="user-info">
                  <div class="user-avatar">{{ user.charAt(0).toUpperCase() }}</div>
                  <div class="user-details">
                    <div class="username">{{ user }}</div>
                    <div class="user-status">已连接</div>
                  </div>
                </div>
                <button class="logout-btn" @click="logout">
                  <span>断开连接</span>
                </button>
              </div>

              <div class="quick-access">
                <div class="access-title">快速访问</div>
                <div class="access-buttons">
                  <router-link to="/start" class="access-btn primary">
                    <span class="btn-icon">🎮</span>
                    <span>进入游戏</span>
                  </router-link>
                  <router-link to="/status" class="access-btn secondary">
                    <span class="btn-icon">📊</span>
                    <span>游戏状态</span>
                  </router-link>
                  <router-link to="/profile" class="access-btn tertiary">
                    <span class="btn-icon">⚙️</span>
                    <span>账户设置</span>
                  </router-link>
                  <router-link to="/admin" class="access-btn admin">
                    <span class="btn-icon">🛠️</span>
                    <span>管理面板</span>
                  </router-link>
                </div>
              </div>
            </div>
          </div>

          <!-- 游戏宣传图片区域 -->
          <div class="promo-section">
            <div class="promo-banner">
              <div class="banner-content">
                <h3>DTS Battle Royale</h3>
                <p>适度游戏益脑，沉迷游戏伤身</p>
                <p>合理安排时间，享受健康生活</p>
                <p>仅供18岁以上成年人娱乐</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- 底部状态栏 -->
      <footer class="status-footer">
        <div class="footer-stats">
          <span class="stat-item">激活人数: {{ gameInfo.alivenum ?? 0 }}</span>
          <span class="stat-separator">|</span>
          <span class="stat-item">生存人数: {{ gameInfo.alivenum ?? 0 }}</span>
          <span class="stat-separator">|</span>
          <span class="stat-item">死亡总数: {{ gameInfo.deathnum ?? 0 }}</span>
        </div>
        <div class="footer-version">
          <span>游戏版本: {{ gameInfo.version ?? '1.0' }}</span>
        </div>
      </footer>
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
import { logs, resetLogs } from '../store/logs'
import { resetChats } from '../store/chat'

const gameInfo = ref({})
const currentTime = ref(Date.now())

const loginForm = reactive({ username: '', password: '' })
const registerForm = reactive({ username: '', password: '' })
const activeTab = ref('login')

const loggedIn = computed(() => !!token.value)

function formatTime(t) {
  const date = new Date(t)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

const gameStatus = computed(() => {
  if (!Object.keys(gameInfo.value).length) return '未知状态'
  const state = gameInfo.value.gamestate
  if (state >= 30) return '游戏锁定'
  if (state >= 20) return '游戏进行中'
  if (state > 0) return '等待开始'
  return '游戏结束'
})

const runtime = computed(() => {
  if (!gameInfo.value?.starttime) return '00:00:00'
  const diff = currentTime.value - gameInfo.value.starttime * 1000
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function getSystemStatusClass() {
  const status = gameStatus.value
  if (status === '游戏进行中') return 'status-active'
  if (status === '游戏锁定') return 'status-locked'
  if (status === '游戏结束') return 'status-ended'
  return 'status-unknown'
}

function getGameStateTextClass() {
  const status = gameStatus.value
  if (status === '游戏进行中') return 'success'
  if (status === '游戏锁定') return 'warning'
  if (status === '游戏结束') return 'danger'
  return ''
}

function getRainStyle(index) {
  const delay = Math.random() * 5
  const duration = 3 + Math.random() * 2
  const left = (index * 5) % 100
  
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
    animationDuration: `${duration}s`,
  }
}

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
    resetLogs(playerId.value)
    resetChats(playerId.value)
    playerId.value = ''
    playerInfo.value = null
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
    resetLogs(playerId.value)
    resetChats(playerId.value)
    playerId.value = ''
    playerInfo.value = null
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
    resetLogs(playerId.value)
    resetChats(playerId.value)
    playerId.value = ''
    playerInfo.value = null
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
  resetLogs(playerId.value)
  resetChats(playerId.value)
  playerId.value = ''
  playerInfo.value = null
  localStorage.removeItem('user')
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('playerId')
}
</script>

<style scoped>
.dts-terminal {
  min-height: 100vh;
  background: #0a0f1c;
  color: #e0e6ed;
  font-family: 'Courier New', 'Microsoft YaHei', monospace;
  position: relative;
  overflow-x: hidden;
}

.terminal-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.matrix-rain {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.rain-column {
  position: absolute;
  top: -100px;
  width: 2px;
  height: 100px;
  background: linear-gradient(to bottom, transparent, #00ff41, transparent);
  animation: rain linear infinite;
  opacity: 0.3;
}

@keyframes rain {
  0% {
    transform: translateY(-100px);
    opacity: 0;
  }
  10% {
    opacity: 0.3;
  }
  90% {
    opacity: 0.3;
  }
  100% {
    transform: translateY(100vh);
    opacity: 0;
  }
}

.circuit-pattern {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px),
    linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  opacity: 0.5;
}

.terminal-content {
  position: relative;
  z-index: 1;
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.system-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  border-radius: 4px;
  margin-bottom: 20px;
  backdrop-filter: blur(10px);
}

.header-left {
  display: flex;
  align-items: center;
}

.system-logo {
  display: flex;
  align-items: center;
  gap: 15px;
}

.logo-skull {
  font-size: 2.5rem;
  filter: drop-shadow(0 0 10px #ff6b6b);
}

.logo-text {
  display: flex;
  flex-direction: column;
}

.system-name {
  font-size: 1.8rem;
  font-weight: bold;
  margin: 0;
  color: #ffffff;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.system-desc {
  font-size: 0.9rem;
  margin: 0;
  color: #888;
  font-style: italic;
}

.header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.system-time {
  font-size: 0.9rem;
  color: #00ff41;
}

.time-label {
  margin-right: 8px;
  color: #888;
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}

.system-status.status-active .status-dot {
  background: #00ff41;
  box-shadow: 0 0 10px #00ff41;
}

.system-status.status-locked .status-dot {
  background: #ffa500;
  box-shadow: 0 0 10px #ffa500;
}

.system-status.status-ended .status-dot {
  background: #ff6b6b;
  box-shadow: 0 0 10px #ff6b6b;
}

.main-panels {
  display: grid;
  grid-template-columns: 500px 1fr;
  gap: 20px;
}

.left-info-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-section {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid #333;
  border-radius: 4px;
  padding: 15px;
  backdrop-filter: blur(5px);
}

.section-title {
  color: #00ff41;
  font-weight: bold;
  margin-bottom: 12px;
  font-size: 1rem;
  border-bottom: 1px solid #333;
  padding-bottom: 5px;
}

.status-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.label {
  color: #aaa;
  flex: 1;
}

.value {
  color: #fff;
  font-weight: bold;
  text-align: right;
}

.value.success {
  color: #00ff41;
}

.value.warning {
  color: #ffa500;
}

.value.danger {
  color: #ff6b6b;
}

.game-info-text {
  font-size: 0.9rem;
  line-height: 1.6;
}

.game-info-text p {
  margin: 0 0 8px 0;
  color: #ccc;
}

.game-alerts {
  margin-top: 12px;
  border-top: 1px solid #333;
  padding-top: 12px;
}

.alert-line {
  font-size: 0.85rem;
  margin-bottom: 6px;
  padding: 4px 8px;
  border-left: 3px solid;
  background: rgba(255, 255, 255, 0.05);
}

.alert-line.danger {
  border-left-color: #ff6b6b;
  color: #ffcccc;
}

.alert-line.warning {
  border-left-color: #ffa500;
  color: #ffe0b3;
}

.alert-line.info {
  border-left-color: #00ff41;
  color: #ccffcc;
}

.admin-section {
  border-color: #ffa500;
  background: rgba(255, 165, 0, 0.1);
}

.admin-controls {
  display: flex;
  gap: 12px;
}

.admin-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid;
  border-radius: 4px;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  transition: all 0.3s;
}

.start-btn {
  border-color: #00ff41;
  color: #00ff41;
}

.start-btn:hover {
  background: rgba(0, 255, 65, 0.1);
}

.stop-btn {
  border-color: #ff6b6b;
  color: #ff6b6b;
}

.stop-btn:hover {
  background: rgba(255, 107, 107, 0.1);
}

.btn-icon {
  font-size: 0.8rem;
}

.right-auth-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.auth-container,
.user-panel {
  flex: 1;
}

.auth-terminal,
.user-terminal {
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  border-radius: 4px;
  backdrop-filter: blur(10px);
}

.terminal-header,
.user-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #333;
  background: rgba(0, 0, 0, 0.3);
}

.terminal-title {
  color: #00ff41;
  font-weight: bold;
  font-size: 1rem;
}

.terminal-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #888;
}

.indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00ff41;
  box-shadow: 0 0 6px #00ff41;
}

.auth-tabs {
  display: flex;
  border-bottom: 1px solid #333;
}

.auth-tab {
  flex: 1;
  padding: 12px 20px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  transition: all 0.3s;
}

.auth-tab.active {
  background: rgba(0, 255, 65, 0.1);
  color: #00ff41;
  border-bottom: 2px solid #00ff41;
}

.auth-tab:hover {
  background: rgba(255, 255, 255, 0.05);
}

.auth-form {
  padding: 20px;
}

.input-group {
  margin-bottom: 16px;
}

.input-label {
  display: block;
  margin-bottom: 6px;
  color: #888;
  font-size: 0.9rem;
}

.terminal-input {
  width: 100%;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #444;
  border-radius: 3px;
  color: #fff;
  font-family: inherit;
  font-size: 0.9rem;
  transition: all 0.3s;
}

.terminal-input:focus {
  outline: none;
  border-color: #00ff41;
  box-shadow: 0 0 5px rgba(0, 255, 65, 0.3);
}

.terminal-input::placeholder {
  color: #666;
}

.auth-submit-btn {
  width: 100%;
  padding: 12px 20px;
  background: transparent;
  border: 1px solid #00ff41;
  border-radius: 3px;
  color: #00ff41;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s;
  margin-top: 10px;
}

.auth-submit-btn:hover {
  background: rgba(0, 255, 65, 0.1);
  transform: translateY(-1px);
}

.auth-submit-btn.register {
  border-color: #00aaff;
  color: #00aaff;
}

.auth-submit-btn.register:hover {
  background: rgba(0, 170, 255, 0.1);
}

.btn-arrow {
  font-size: 0.8rem;
  transition: transform 0.3s;
}

.auth-submit-btn:hover .btn-arrow {
  transform: translateX(2px);
}

.auth-footer {
  padding: 15px 20px;
  border-top: 1px solid #333;
  background: rgba(0, 0, 0, 0.3);
  text-align: center;
}
</style>