import { createRouter, createWebHistory } from 'vue-router';
import Home from '../pages/Home.vue';
import Profile from '../pages/Profile.vue';
import Start from '../pages/Start.vue';
import Game from '../pages/Game.vue';
import Status from '../pages/Status.vue';
import Victory from '../pages/Victory.vue';
import GameOver from '../pages/GameOver.vue';
import Help from '../pages/Help.vue';
import Admin from '../pages/Admin.vue';
import ItemAdmin from '../pages/ItemAdmin.vue';

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/profile', name: 'Profile', component: Profile },
  { path: '/start', name: 'Start', component: Start },
  { path: '/game', name: 'Game', component: Game },
  { path: '/status', name: 'Status', component: Status },
  { path: '/victory', name: 'Victory', component: Victory },
  { path: '/gameover', name: 'GameOver', component: GameOver },
  { path: '/help', name: 'Help', component: Help },
  { path: '/admin', name: 'Admin', component: Admin },
  { path: '/admin/items', name: 'ItemAdmin', component: ItemAdmin },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
