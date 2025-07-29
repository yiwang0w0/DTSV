<template>
  <div class="page">
    <h2>NPC刷新机制管理</h2>
    <el-button type="primary" size="small" @click="openCreate" style="margin-bottom:10px">新建</el-button>
    <TablePanel
      :items="items"
      :field-meta="fields"
      :loading="loading"
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
import { ref, onMounted } from 'vue'
import TablePanel from '../components/TablePanel.vue'
import FormDialog from '../components/FormDialog.vue'
import { adminList, adminCreate, adminUpdate, adminDelete, adminFieldMeta } from '../api'

const items = ref([])
const fields = ref([])
const loading = ref(false)
const skip = ref(0)
const limit = 50
const dialogVisible = ref(false)
const dialogTitle = ref('')
const formData = ref({})
let editId = ''

onMounted(async () => {
  const { data } = await adminFieldMeta('npcspawns')
  fields.value = data
  fetchItems()
})

async function fetchItems(append=false){
  loading.value = true
  try{
    const { data } = await adminList('npcspawns', { skip: skip.value, limit })
    items.value = append ? items.value.concat(data) : data
    skip.value += data.length
  }catch(e){
    alert(e.response?.data?.msg || '加载失败')
  }finally{
    loading.value = false
  }
}

function loadMore(){ fetchItems(true) }

function openEdit(row){
  editId = row._id
  dialogTitle.value = '编辑'
  formData.value = { ...row }
  dialogVisible.value = true
}

function openCreate(){
  editId = ''
  dialogTitle.value = '新建'
  formData.value = {}
  dialogVisible.value = true
}

async function saveDialog(){
  try{
    if(editId){
      await adminUpdate('npcspawns', editId, formData.value)
    }else{
      await adminCreate('npcspawns', formData.value)
    }
    dialogVisible.value = false
    skip.value = 0
    fetchItems()
  }catch(e){
    alert(e.response?.data?.msg || '保存失败')
  }
}

async function removeRow(row){
  if(!confirm('确定删除？')) return
  try{
    await adminDelete('npcspawns', row._id)
    skip.value = 0
    fetchItems()
  }catch(e){
    alert(e.response?.data?.msg || '删除失败')
  }
}
</script>

<style scoped>
.page {
  padding: 20px;
}
</style>
