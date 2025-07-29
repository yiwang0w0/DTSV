<template>
  <div class="page">
    <h2>NPC刷新机制管理</h2>
    <div style="margin-bottom: 10px">
      <el-button
        v-if="areaId"
        size="small"
        @click="router.push(`/admin/mapresources?area=${areaId}`)"
        >返回</el-button
      >
      <el-button
        type="primary"
        size="small"
        @click="openCreate"
        style="margin-left: 5px"
        >新建</el-button
      >
    </div>
    <TablePanel
      :items="items"
      :field-meta="fields"
      :loading="loading"
      :disable-load="allLoaded"
      @load-more="loadMore"
      @edit="openEdit"
      @remove="removeRow"
    />
    <FormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :fields="fields"
      :form="formData"
      @save="saveDialog"
      @close="dialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TablePanel from '../components/TablePanel.vue';
import FormDialog from '../components/FormDialog.vue';
import {
  adminList,
  adminCreate,
  adminUpdate,
  adminDelete,
  adminFieldMeta,
} from '../api';

const route = useRoute();
const router = useRouter();
const areaId = ref(route.query.area ? Number(route.query.area) : 0);

const items = ref([]);
const fields = ref([]);
const loading = ref(false);
const skip = ref(0);
const limit = 50;
const allLoaded = ref(false);
const dialogVisible = ref(false);
const dialogTitle = ref('');
const formData = ref({});
let editId = '';

onMounted(async () => {
  const { data } = await adminFieldMeta('npcspawns');
  fields.value = data;
  if (areaId.value) {
    const af = fields.value.find((f) => f.name === 'area');
    if (af) af.disabled = true;
  }
  allLoaded.value = false;
  fetchItems();
});

watch(
  () => route.query.area,
  (v) => {
    areaId.value = v ? Number(v) : 0;
    const af = fields.value.find((f) => f.name === 'area');
    if (af) af.disabled = !!areaId.value;
    skip.value = 0;
    allLoaded.value = false;
    items.value = [];
    fetchItems();
  },
);

async function fetchItems(append = false) {
  if (loading.value || allLoaded.value) return;
  loading.value = true;
  try {
    const params = { skip: skip.value, limit };
    if (areaId.value) params.area = areaId.value;
    const { data } = await adminList('npcspawns', params);
    items.value = append ? items.value.concat(data) : data;
    if (data.length < limit) allLoaded.value = true;
    skip.value += data.length;
  } catch (e) {
    alert(e.response?.data?.msg || '加载失败');
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  fetchItems(true);
}

function openEdit(row) {
  editId = row._id;
  dialogTitle.value = '编辑';
  formData.value = { ...row };
  dialogVisible.value = true;
}

function openCreate() {
  editId = '';
  dialogTitle.value = '新建';
  formData.value = {
    area: areaId.value,
    stage: 'start',
    type: 1,
    sub: 0,
    num: 1,
  };
  dialogVisible.value = true;
}

async function saveDialog() {
  try {
    if (editId) {
      await adminUpdate('npcspawns', editId, formData.value);
    } else {
      await adminCreate('npcspawns', formData.value);
    }
    dialogVisible.value = false;
    skip.value = 0;
    allLoaded.value = false;
    items.value = [];
    fetchItems();
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败');
  }
}

async function removeRow(row) {
  if (!confirm('确定删除？')) return;
  try {
    await adminDelete('npcspawns', row._id);
    skip.value = 0;
    allLoaded.value = false;
    items.value = [];
    fetchItems();
  } catch (e) {
    alert(e.response?.data?.msg || '删除失败');
  }
}
</script>

<style scoped>
.page {
  padding: 20px;
}
</style>
