import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import { ElInfiniteScroll, ElLoading } from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'

const app = createApp(App)
app.use(router)
app.use(ElementPlus)
app.use(ElInfiniteScroll)
app.use(ElLoading)
app.mount('#app')
