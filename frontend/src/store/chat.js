import { ref, watch } from 'vue';
import { playerId } from './user';

export const chats = ref([]);

function loadChats() {
  if (!playerId.value) {
    chats.value = [];
  } else {
    const key = `chats_${playerId.value}`;
    chats.value = JSON.parse(localStorage.getItem(key) || '[]');
  }
}

loadChats();

watch(playerId, loadChats);

watch(
  chats,
  (val) => {
    if (!playerId.value) return;
    const key = `chats_${playerId.value}`;
    if (val && val.length) {
      localStorage.setItem(key, JSON.stringify(val.slice(-100)));
    } else {
      localStorage.removeItem(key);
    }
  },
  { deep: true },
);

export function addChat(msg) {
  if (msg) chats.value.push(msg);
}

export function resetChats(pid = playerId.value) {
  if (pid) {
    localStorage.removeItem(`chats_${pid}`);
  }
  chats.value = [];
}

export { loadChats };
