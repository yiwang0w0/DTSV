import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Mail from '../pages/Mail.vue'
import Profile from '../pages/Profile.vue'
import Start from '../pages/Start.vue'
import Game from '../pages/Game.vue'
import Status from '../pages/Status.vue'
import Victory from '../pages/Victory.vue'
import Ranking from '../pages/Ranking.vue'
import Help from '../pages/Help.vue'
import Admin from '../pages/Admin.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/mail', name: 'Mail', component: Mail },
  { path: '/profile', name: 'Profile', component: Profile },
  { path: '/start', name: 'Start', component: Start },
  { path: '/game', name: 'Game', component: Game },
  { path: '/status', name: 'Status', component: Status },
  { path: '/victory', name: 'Victory', component: Victory },
  { path: '/ranking', name: 'Ranking', component: Ranking },
  { path: '/help', name: 'Help', component: Help },
  { path: '/admin', name: 'Admin', component: Admin },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
