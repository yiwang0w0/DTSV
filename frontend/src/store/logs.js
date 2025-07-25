import { ref, watch } from 'vue';
import { playerId } from './user';

export const logs = ref([]);

function loadLogs() {
  if (!playerId.value) {
    logs.value = [];
  } else {
    logs.value = JSON.parse(
      localStorage.getItem(`logs_${playerId.value}`) || '[]',
    );
  }
}

loadLogs();

watch(playerId, loadLogs);

watch(
  logs,
  (val) => {
    if (!playerId.value) return;
    if (val && val.length) {
      localStorage.setItem(
        `logs_${playerId.value}`,
        JSON.stringify(val.slice(0, 50)),
      );
    } else {
      localStorage.removeItem(`logs_${playerId.value}`);
    }
  },
  { deep: true },
);

export function resetLogs(pid = playerId.value) {
  if (pid) {
    localStorage.removeItem(`logs_${pid}`);
  }
  logs.value = [];
}

export { loadLogs };
