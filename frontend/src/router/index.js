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
import ItemCategoryAdmin from '../pages/ItemCategoryAdmin.vue';
import MapResourceAdmin from '../pages/MapResourceAdmin.vue';
import MapItemsByArea from '../pages/MapItemsByArea.vue';
import MapTrapsByArea from '../pages/MapTrapsByArea.vue';
import MapTrapTable from '../pages/MapTrapTable.vue';
import ShopItemsByArea from '../pages/ShopItemsByArea.vue';
import MapItemTable from '../pages/MapItemTable.vue';
import NpcSpawnAdmin from '../pages/NpcSpawnAdmin.vue';
import NpcsByArea from '../pages/NpcsByArea.vue';

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
  { path: '/admin/itemcategories', name: 'ItemCategoryAdmin', component: ItemCategoryAdmin },
  { path: '/admin/mapresources', name: 'MapResourceAdmin', component: MapResourceAdmin },
  { path: '/admin/mapitems', name: 'MapItemsByArea', component: MapItemsByArea },
  { path: '/admin/maptraps', name: 'MapTrapsByArea', component: MapTrapsByArea },
  { path: '/admin/shopitems', name: 'ShopItemsByArea', component: ShopItemsByArea },
  { path: '/admin/mapitemtable', name: 'MapItemTable', component: MapItemTable },
  { path: '/admin/maptraptable', name: 'MapTrapTable', component: MapTrapTable },
  { path: '/admin/npcspawns', name: 'NpcSpawnAdmin', component: NpcSpawnAdmin },
  { path: '/admin/npcs', name: 'NpcsByArea', component: NpcsByArea },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
