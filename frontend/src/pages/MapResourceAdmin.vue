<template>
  <div class="page">
    <h2>地图资源管理</h2>
    <template v-if="!areaId">
      <el-button
        type="primary"
        size="small"
        style="margin-bottom: 10px"
        @click="openCreateArea"
        >新建地图</el-button
      >
      <el-row :gutter="20" style="margin-top: 10px">
        <el-col v-for="a in areas" :key="a.pid" :span="8">
          <el-card shadow="hover">
            <template #header>
              <span
                >{{ a.name }} (ID: {{ a.pid }}, 危险度: {{ a.danger }})</span
              >
              <div style="float: right">
                <el-button text size="small" @click="editArea(a)"
                  >编辑</el-button
                >
                <el-button
                  text
                  size="small"
                  type="danger"
                  @click="removeArea(a)"
                  >删除</el-button
                >
              </div>
            </template>
            <div class="btn-row">
              <el-button size="small" @click="goArea(a.pid)"
                >地图物品</el-button
              >
              <el-button size="small" @click="goCategory">物品刷新表</el-button>
            </div>
            <div class="btn-row">
              <el-button size="small" @click="goArea(a.pid)"
                >地图陷阱</el-button
              >
              <el-button size="small" @click="goCategory">陷阱刷新表</el-button>
            </div>
            <div class="btn-row">
              <span>商店</span>
              <el-switch
                v-model="shopMap[a.pid]"
                size="small"
                @change="(val) => toggleShop(a.pid, val)"
                style="margin: 0 5px"
              />
              <el-button
                v-if="shopMap[a.pid]"
                size="small"
                @click="goArea(a.pid)"
                >商店物品</el-button
              >
            </div>
            <div class="btn-row">
              <el-button size="small" @click="goNpcAdmin">NPC管理</el-button>
              <el-button size="small" @click="goNpcSpawn(a.pid)"
                >NPC刷新表</el-button
              >
            </div>
          </el-card>
        </el-col>
      </el-row>
    </template>
    <template v-else>
      <el-button
        style="margin-bottom: 10px"
        size="small"
        @click="router.push({ path: '/admin/mapresources' })"
        >返回</el-button
      >
      <el-tree
        :data="treeData"
        :props="treeProps"
        node-key="id"
        default-expand-all
        @node-click="handleNodeClick"
      >
        <template #default="{ node, data }">
          <span>{{ node.label }}</span>
          <span v-if="data.type === 'shopitem'"> x{{ data.num }}</span>
          <el-button
            v-if="
              ['itemGroup', 'trapGroup', 'shopGroup', 'npcGroup'].includes(
                data.type,
              )
            "
            text
            size="small"
            @click.stop="openCreate(data)"
            >添加</el-button
          >
          <el-button
            v-if="
              ['mapitem', 'maptrap', 'shopitem', 'npc', 'area'].includes(
                data.type,
              )
            "
            text
            size="small"
            @click.stop="openEdit(data)"
            >编辑</el-button
          >
          <el-button
            v-if="['mapitem', 'maptrap', 'shopitem', 'npc'].includes(data.type)"
            text
            size="small"
            type="danger"
            @click.stop="removeNode(data)"
            >删除</el-button
          >
          <el-button
            v-if="data.type === 'category'"
            text
            size="small"
            @click.stop="goCategory"
            >编辑刷新表</el-button
          >
        </template>
      </el-tree>
    </template>
    <FormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :fields="dialogFields"
      :form="formData"
      @save="saveDialog"
      @close="dialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  adminList,
  adminCreate,
  adminUpdate,
  adminDelete,
  adminFieldMeta,
} from '../api';
import FormDialog from '../components/FormDialog.vue';

const router = useRouter();
const route = useRoute();
const areaId = ref(route.query.area ? Number(route.query.area) : 0);
const areas = ref([]);
const shopMap = ref({});
const treeData = ref([]);
const treeProps = { children: 'children', label: 'label' };

const dialogVisible = ref(false);
const dialogTitle = ref('');
const dialogFields = ref([]);
const formData = ref({});
let editCollection = '';
let editId = '';
let currentArea = 0;

onMounted(() => {
  if (areaId.value) fetchData();
  else fetchAreas();
});

watch(
  () => route.query.area,
  (v) => {
    areaId.value = v ? Number(v) : 0;
    if (areaId.value) fetchData();
    else {
      treeData.value = [];
      fetchAreas();
    }
  },
);

async function fetchAreas() {
  try {
    const [areasRes, shopsRes] = await Promise.all([
      adminList('mapareas', { limit: 1000 }),
      adminList('shopitems', { limit: 1000 }),
    ]);
    areas.value = areasRes.data;
    const map = {};
    (shopsRes.data || []).forEach((s) => {
      map[s.area] = true;
    });
    shopMap.value = map;
  } catch {}
}

async function fetchData() {
  try {
    const [areasRes, itemsRes, trapsRes, catsRes, shopsRes, npcsRes] =
      await Promise.all([
        adminList('mapareas', { limit: 1000 }),
        adminList('mapitems', { limit: 1000 }),
        adminList('maptraps', { limit: 1000 }),
        adminList('itemcategories', { limit: 1000 }),
        adminList('shopitems', { limit: 1000 }),
        adminList('npcs', { limit: 1000 }),
      ]);
    buildTree(
      areasRes.data,
      itemsRes.data,
      trapsRes.data,
      catsRes.data,
      shopsRes.data,
      npcsRes.data,
    );
    if (areaId.value) {
      treeData.value = treeData.value.filter((t) => t.area === areaId.value);
    }
  } catch {}
}

function groupBy(list, key) {
  const m = {};
  list.forEach((it) => {
    const v = it[key] || 0;
    if (!m[v]) m[v] = [];
    m[v].push(it);
  });
  return m;
}

function buildTree(areas, items, traps, cats, shops, npcs) {
  const itemByArea = groupBy(items, 'pls');
  const trapByArea = groupBy(traps, 'pls');
  const shopByArea = groupBy(shops, 'area');
  const npcByArea = groupBy(npcs, 'pls');
  const catByArea = {};
  cats.forEach((cat) => {
    (cat.items || []).forEach((e) => {
      const p = e.pls || 0;
      if (!catByArea[p]) catByArea[p] = [];
      if (!catByArea[p].includes(cat)) catByArea[p].push(cat);
    });
  });
  treeData.value = areas.map((a) => {
    const children = [];
    const itemsList = (itemByArea[a.pid] || []).map((it) => ({
      id: it._id,
      label: it.itm,
      type: 'mapitem',
      area: a.pid,
      data: it,
    }));
    children.push({
      id: `items-${a.pid}`,
      label: '地图物品',
      type: 'itemGroup',
      area: a.pid,
      children: itemsList,
    });
    const trapsList = (trapByArea[a.pid] || []).map((it) => ({
      id: it._id,
      label: it.itm,
      type: 'maptrap',
      area: a.pid,
      data: it,
    }));
    children.push({
      id: `traps-${a.pid}`,
      label: '陷阱',
      type: 'trapGroup',
      area: a.pid,
      children: trapsList,
    });
    const catList = (catByArea[a.pid] || []).map((c) => ({
      id: c._id,
      label: c.name,
      type: 'category',
      area: a.pid,
      data: c,
    }));
    children.push({
      id: `cats-${a.pid}`,
      label: '刷新表',
      type: 'catGroup',
      area: a.pid,
      children: catList,
    });
    const shopList = (shopByArea[a.pid] || []).map((s) => ({
      id: s._id,
      label: s.item,
      num: s.num,
      type: 'shopitem',
      area: a.pid,
      data: s,
    }));
    if (shopList.length)
      children.push({
        id: `shops-${a.pid}`,
        label: '商店物品',
        type: 'shopGroup',
        area: a.pid,
        children: shopList,
      });
    else
      children.push({
        id: `shop-${a.pid}`,
        label: '商店: 无',
        type: 'info',
        area: a.pid,
      });
    const npcList = (npcByArea[a.pid] || []).map((n) => ({
      id: n._id,
      label: `${n.name}(${n.spawnStage})`,
      type: 'npc',
      area: a.pid,
      data: n,
    }));
    children.push({
      id: `npcs-${a.pid}`,
      label: 'NPC',
      type: 'npcGroup',
      area: a.pid,
      children: npcList,
    });
    return {
      id: a._id,
      label: a.name,
      type: 'area',
      area: a.pid,
      data: a,
      children,
    };
  });
}

function handleNodeClick(data) {
  // do nothing
}

async function openEdit(data) {
  editCollection =
    data.type === 'mapitem'
      ? 'mapitems'
      : data.type === 'maptrap'
        ? 'maptraps'
        : data.type === 'shopitem'
          ? 'shopitems'
          : data.type === 'npc'
            ? 'npcs'
            : data.type === 'area'
              ? 'mapareas'
              : '';
  editId = data.data._id;
  currentArea = data.area;
  const { data: fields } = await adminFieldMeta(editCollection);
  dialogFields.value = fields;
  dialogTitle.value = '编辑';
  formData.value = { ...data.data };
  dialogVisible.value = true;
}

async function openCreate(group) {
  const map = {
    itemGroup: 'mapitems',
    trapGroup: 'maptraps',
    shopGroup: 'shopitems',
    npcGroup: 'npcs',
  };
  const col = map[group.type];
  if (!col) return;
  editCollection = col;
  editId = '';
  currentArea = group.area;
  const { data: fields } = await adminFieldMeta(col);
  dialogFields.value = fields;
  dialogTitle.value = '新建';
  formData.value = {};
  if (col === 'mapitems' || col === 'maptraps' || col === 'npcs') {
    formData.value.pls = group.area;
    if (col === 'mapitems') formData.value.stage = 'start';
  }
  if (col === 'shopitems') formData.value.area = group.area;
  dialogVisible.value = true;
}

async function saveDialog() {
  try {
    if (editId) {
      await adminUpdate(editCollection, editId, formData.value);
    } else {
      await adminCreate(editCollection, formData.value);
    }
    dialogVisible.value = false;
    fetchData();
  } catch (e) {
    alert(e.response?.data?.msg || '保存失败');
  }
}

async function removeNode(data) {
  const map = {
    mapitem: 'mapitems',
    maptrap: 'maptraps',
    shopitem: 'shopitems',
    npc: 'npcs',
  };
  const col = map[data.type];
  if (!col) return;
  if (!confirm('确定删除？')) return;
  try {
    await adminDelete(col, data.data._id);
    fetchData();
  } catch (e) {
    alert(e.response?.data?.msg || '删除失败');
  }
}

function goArea(pid) {
  router.push({ path: '/admin/mapresources', query: { area: pid } });
}

function goNpcSpawn(pid) {
  router.push({ path: '/admin/npcspawns', query: { area: pid } });
}

function goNpcAdmin() {
  router.push({ path: '/admin', query: { collection: 'npcs' } });
}

async function openCreateArea() {
  editCollection = 'mapareas';
  editId = '';
  const { data: fields } = await adminFieldMeta('mapareas');
  dialogFields.value = fields;
  dialogTitle.value = '新建地图';
  formData.value = {};
  dialogVisible.value = true;
}

async function editArea(area) {
  editCollection = 'mapareas';
  editId = area._id;
  const { data: fields } = await adminFieldMeta('mapareas');
  dialogFields.value = fields;
  dialogTitle.value = '编辑地图';
  formData.value = { ...area };
  dialogVisible.value = true;
}

async function removeArea(area) {
  if (!confirm('确定删除？')) return;
  try {
    await adminDelete('mapareas', area._id);
    fetchAreas();
  } catch (e) {
    alert(e.response?.data?.msg || '删除失败');
  }
}

function toggleShop(pid, val) {
  shopMap.value = { ...shopMap.value, [pid]: val };
}

function goCategory() {
  router.push('/admin/itemcategories');
}
</script>

<style scoped>
.page {
  padding: 20px;
}
.btn-row {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
  gap: 6px;
}
</style>
