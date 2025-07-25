<template>
  <el-card class="chat-panel" shadow="never">
    <div ref="listEl" class="messages">
      <div v-for="c in messages" :key="c.cid || c.time" class="chat-item">
        <span v-if="c.type !== 2" class="sender">{{ c.send }}:</span>
        <span v-html="c.msg" />
      </div>
    </div>
    <div class="input-area">
      <el-input v-model="text" size="small" placeholder="输入内容" @keyup.enter="submit" />
      <el-button size="small" type="primary" @click="submit" style="margin-left:8px">发送</el-button>
    </div>
  </el-card>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

defineProps({
  messages: Array
})
const emit = defineEmits(['send'])
const text = ref('')
const listEl = ref(null)

function submit() {
  const m = text.value.trim()
  if (!m) return
  emit('send', m)
  text.value = ''
}

watch(() => messages, () => {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
})
</script>

<style scoped>
.chat-panel {
  margin-bottom: 20px;
}
.messages {
  max-height: 200px;
  overflow-y: auto;
  padding-bottom: 6px;
}
.chat-item {
  padding: 4px 0;
  border-bottom: 1px solid #eee;
}
.sender {
  font-weight: bold;
  margin-right: 4px;
}
.input-area {
  display: flex;
  margin-top: 6px;
}
</style>
