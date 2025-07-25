import { ref, watch } from 'vue';

export const mapAreas = ref(
  JSON.parse(localStorage.getItem('mapAreas') || '[]'),
);

watch(mapAreas, (val) => {
  if (val && val.length) {
    localStorage.setItem('mapAreas', JSON.stringify(val));
  } else {
    localStorage.removeItem('mapAreas');
  }
});
