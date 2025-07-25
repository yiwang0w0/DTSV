import { ref, watch } from 'vue';
import { playerId } from './user';

export const playerInfo = ref(null);

function loadPlayer() {
  if (!playerId.value) {
    playerInfo.value = null;
  } else {
    playerInfo.value = JSON.parse(
      localStorage.getItem(`playerInfo_${playerId.value}`) || 'null',
    );
  }
}

loadPlayer();

watch(playerId, loadPlayer);

watch(
  playerInfo,
  (val) => {
    if (!playerId.value) return;
    if (val) {
      localStorage.setItem(`playerInfo_${playerId.value}`, JSON.stringify(val));
    } else {
      localStorage.removeItem(`playerInfo_${playerId.value}`);
    }
  },
  { deep: true },
);

export { loadPlayer };
