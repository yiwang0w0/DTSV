<template>
  <div class="dark-container">
    <!-- 动态背景 -->
    <div class="dark-background">
      <div class="matrix-rain">
        <div v-for="i in 20" :key="i" class="rain-column" :style="getRainStyle(i)"></div>
      </div>
      <div class="circuit-pattern"></div>
    </div>

    <!-- 主内容容器 -->
    <div class="home-container">
      <!-- 顶部标题栏 -->
      <header class="dark-panel system-header">
        <div class="header-content">
          <div class="header-left">
            <span class="logo-skull">💀</span>
            <div>
              <h1 class="text-primary">DTS 大逃杀</h1>
              <p class="text-secondary">Death Tournament Survival</p>
            </div>
          </div>
          <div class="header-right">
            <div class="text-secondary">系统时间: <span class="text-primary">{{ formatTime(currentTime) }}</span></div>
            <div class="system-status">
              <span class="status-dot" :class="getSystemStatusClass()"></span>
              <span>{{ gameStatus }}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- 主面板区域 -->
      <main class="main-grid">
        <!-- 左侧信息栏 -->
        <div class="left-column">
          <!-- 当前状态 -->
          <div class="dark-panel">
            <div class="dark-panel-header">当前状态:</div>
            <div class="dark-panel-body">
              <div class="info-line">
                <span>游戏版本:</span>
                <span class="text-primary">{{ gameInfo.version ?? 'Unknown' }}</span>
              </div>
              <div class="info-line">
                <span>运行时长:</span>
                <span class="text-primary">{{ runtime }}</span>
              </div>
              <div class="info-line">
                <span>服务器:</span>
                <span class="text-primary">主服务器</span>
              </div>
            </div>
          </div>

          <!-- 系统状况 -->
          <div class="dark-panel">
            <div class="dark-panel-header">系统状况:</div>
            <div class="dark-panel-body">
              <div class="info-line">
                <span>游戏状态:</span>
                <span :class="getGameStateTextClass()">{{ gameStatus }}</span>
              </div>
              <div class="info-line">
                <span>危险区域:</span>
                <span class="text-danger">{{ gameInfo.areanum ?? 'N/A' }}</span>
              </div>
              <div class="info-line">
                <span>存活玩家:</span>
                <span class="text-success">{{ gameInfo.alivenum ?? 'N/A' }}</span>
              </div>
              <div class="info-line">
                <span>死亡总数:</span>
                <span class="text-warning">{{ gameInfo.deathnum ?? 'N/A' }}</span>
              </div>
            </div>
          </div>

          <!-- 游戏信息 -->
          <div class="dark-panel">
            <div class="dark-panel-header">游戏信息:</div>
            <div class="dark-panel-body">
              <p>这里是说明</p>
              <p>1.0版本，稳定子版本</p>
              <p>当前人数是 {{ gameInfo.alivenum ?? 0 }} 人</p>
              <div class="alerts">
                <div class="alert danger">注意：进入特斗后，首先观察四周再行动。</div>
                <div class="alert warning">禁区间隔时间：40分钟，2禁后停止激活</div>
                <div class="alert info">每次增加禁区：4个，当前禁区数：{{ gameInfo.areanum ?? 0 }}</div>
              </div>
            </div>
          </div>

          <!-- 管理员控制 -->
          <div v-if="loggedIn" class="dark-panel admin-panel">
            <div class="dark-panel-header">管理员控制:</div>
            <div class="dark-panel-body">
              <div class="admin-controls">
                <button class="dark-btn dark-btn-primary" @click="manualStart">
                  ▶ 启动游戏
                </button>
                <button class="dark-btn dark-btn-danger" @click="manualStop">
                  ⏹ 停止游戏
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧认证面板 -->
        <div class="right-column">
          <!-- 未登录状态 -->
          <div v-if="!loggedIn" class="dark-panel">
            <div class="dark-panel-header">
              <span>ACCESS CONTROL</span>
              <span class="secure-indicator">
                <span class="status-dot status-active"></span>SECURE
              </span>
            </div>
            <div class="dark-panel-body">
              <!-- 切换标签 -->
              <div class="auth-tabs">
                <button 
                  class="tab-btn" 
                  :class="{ active: activeTab === 'login' }"
                  @click="activeTab = 'login'"
                >
                  用户登录
                </button>
                <button 
                  class="tab-btn" 
                  :class="{ active: activeTab === 'register' }"
                  @click="activeTab = 'register'"
                >
                  新用户注册
                </button>
              </div>

              <!-- 登录表单 -->
              <div v-if="activeTab === 'login'" class="auth-form">
                <div class="form-group">
                  <label>账号:</label>
                  <input 
                    v-model="loginForm.username" 
                    class="dark-input"
                    placeholder="输入用户名"
                    @keyup.enter="login"
                  />
                </div>
                <div class="form-group">
                  <label>密码:</label>
                  <input 
                    v-model="loginForm.password" 
                    type="password"
                    class="dark-input"
                    placeholder="输入密码"
                    @keyup.enter="login"
                  />
                </div>
                <button class="dark-btn dark-btn-primary full-width" @click="login">
                  登录 ►
                </button>
              </div>

              <!-- 注册表单 -->
              <div v-if="activeTab === 'register'" class="auth-form">
                <div class="form-group">
                  <label>账号:</label>
                  <input 
                    v-model="registerForm.username" 
                    class="dark-input"
                    placeholder="创建用户名"
                    @keyup.enter="register"
                  />
                </div>
                <div class="form-group">
                  <label>密码:</label>
                  <input 
                    v-model="registerForm.password" 
                    type="password"
                    class="dark-input"
                    placeholder="设置密码"
                    @keyup.enter="register"
                  />
                </div>
                <button class="dark-btn dark-btn-primary full-width" @click="register">
                  注册 ►
                </button>
              </div>

              <div class="help-text">
                第一次玩的，请先看 <a href="/help" class="text-primary">游戏帮助</a> !!!
              </div>
            </div>
          </div>

          <!-- 已登录状态 -->
          <div v-else class="dark-panel">
            <div class="dark-panel-header">
              <div class="user-info">
                <div class="user-avatar">{{ user.charAt(0).toUpperCase() }}</div>
                <div>
                  <div class="text-primary">{{ user }}</div>
                  <div class="text-secondary">已连接</div>
                </div>
              </div>
              <button class="dark-btn dark-btn-danger" @click="logout">断开连接</button>
            </div>
            <div class="dark-panel-body">
              <div class="quick-access">
                <div class="section-title">快速访问</div>
                <div class="access-grid">
                  <router-link to="/start" class="dark-btn dark-btn-primary">
                    🎮 进入游戏
                  </router-link>
                  <router-link to="/status" class="dark-btn">
                    📊 游戏状态
                  </router-link>
                  <router-link to="/profile" class="dark-btn">
                    ⚙️ 账户设置
                  </router-link>
                  <router-link to="/admin" class="dark-btn dark-btn-warning">
                    🛠️ 管理面板
                  </router-link>
                </div>
              </div>
            </div>
          </div>

          <!-- 宣传区域 -->
          <div class="dark-panel">
            <div class="dark-panel-header">DTS Battle Royale</div>
            <div class="dark-panel-body">
              <p class="text-secondary">这里是公告</p>
              <p class="text-secondary">这里是公告</p>
              <p class="text-secondary">这里是公告</p>
            </div>
          </div>
        </div>
      </main>

      <!-- 底部状态栏 -->
      <footer class="dark-panel status-footer">
        <div class="footer-stats">
          <span>激活人数: {{ gameInfo.alivenum ?? 0 }}</span>
          <span>|</span>
          <span>生存人数: {{ gameInfo.alivenum ?? 0 }}</span>
          <span>|</span>
          <span>死亡总数: {{ gameInfo.deathnum ?? 0 }}</span>
        </div>
        <div class="text-secondary">游戏版本: {{ gameInfo.version ?? '1.0' }}</div>
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
  if (status === '游戏锁定') return 'status-warning'
  if (status === '游戏结束') return 'status-danger'
  return 'status-inactive'
}

function getGameStateTextClass() {
  const status = gameStatus.value
  if (status === '游戏进行中') return 'text-success'
  if (status === '游戏锁定') return 'text-warning'
  if (status === '游戏结束') return 'text-danger'
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

let timeTimer, infoTimer
onMounted(() => {
  fetchGameInfo()
  timeTimer = setInterval(() => { currentTime.value = Date.now() }, 1000)
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
    if (refreshToken.value) await logoutApi(refreshToken.value)
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
/* 主容器居中 */
.home-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

/* 系统标题 */
.system-header .dark-panel-header {
  padding: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.logo-skull {
  font-size: 2rem;
  filter: drop-shadow(0 0 10px #ff6b6b);
}

.header-left h1 {
  font-size: 1.8rem;
  margin: 0;
}

.header-left p {
  font-size: 0.9rem;
  margin: 0;
  font-style: italic;
}

.header-right {
  text-align: right;
  font-size: 0.9rem;
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
}

/* 主网格布局 */
.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.left-column, .right-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 信息行 */
.info-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.9rem;
}

/* 警告信息 */
.alerts {
  margin-top: 12px;
  border-top: 1px solid #333;
  padding-top: 12px;
}

.alert {
  font-size: 0.85rem;
  margin-bottom: 6px;
  padding: 4px 8px;
  border-left: 3px solid;
  background: rgba(255, 255, 255, 0.05);
}

.alert.danger { border-left-color: #ff6b6b; color: #ffcccc; }
.alert.warning { border-left-color: #ffa500; color: #ffe0b3; }
.alert.info { border-left-color: #00ff41; color: #ccffcc; }

/* 管理员面板 */
.admin-panel {
  border-color: #ffa500;
  background: rgba(255, 165, 0, 0.05);
}

.admin-controls {
  display: flex;
  gap: 12px;
}

/* 认证相关 */
.secure-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
}

.auth-tabs {
  display: flex;
  border-bottom: 1px solid #333;
  margin-bottom: 20px;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.3s;
}

.tab-btn.active {
  background: rgba(0, 255, 65, 0.1);
  color: #00ff41;
  border-bottom: 2px solid #00ff41;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.9rem;
  color: #888;
}

.full-width {
  width: 100%;
}

.help-text {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #333;
  text-align: center;
  font-size: 0.85rem;
  color: #888;
}

/* 用户信息 */
.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00ff41, #00aa33);
  color: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* 快速访问 */
.section-title {
  color: #00ff41;
  font-weight: bold;
  margin-bottom: 12px;
  border-bottom: 1px solid #333;
  padding-bottom: 6px;
}

.access-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* 底部状态栏 */
.status-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.footer-stats {
  display: flex;
  gap: 15px;
  color: #888;
}

/* 响应式 */
@media (max-width: 1024px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
  
  .left-column { order: 2; }
  .right-column { order: 1; }
}

@media (max-width: 768px) {
  .home-container {
    padding: 15px;
  }
  
  .header-content {
    flex-direction: column;
    gap: 10px;
    text-align: center;
  }
  
  .access-grid {
    grid-template-columns: 1fr;
  }
  
  .admin-controls {
    flex-direction: column;
  }
  
  .status-footer {
    flex-direction: column;
    gap: 10px;
  }
}
</style>