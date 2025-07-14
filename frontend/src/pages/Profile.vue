<template>
  <div class="page">
    <el-form :model="form" label-width="80px">
      <el-form-item label="用户名">
        <el-input v-model="form.username" />
      </el-form-item>
      <el-form-item label="旧密码">
        <el-input v-model="form.oldPassword" type="password" />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="form.newPassword" type="password" />
      </el-form-item>
      <el-form-item label="头像">
        <el-input v-model="form.avatar" placeholder="暂未开放上传" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="save">保存</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getProfile, updateProfile } from '../api'
import { user } from '../store/user'

const form = ref({
  username: '',
  oldPassword: '',
  newPassword: '',
  avatar: ''
})

onMounted(async () => {
  const res = await getProfile()
  form.value.username = res.data.username
  form.value.avatar = res.data.avatar
})

const save = async () => {
  await updateProfile(form.value)
  user.value = form.value.username
  localStorage.setItem('user', form.value.username)
  form.value.oldPassword = ''
  form.value.newPassword = ''
}
</script>

<style scoped>
.page { padding: 20px; }
</style>
