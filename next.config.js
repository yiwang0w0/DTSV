/** @type {import('next').NextConfig} */
const locatorJSPlugin = require('locatorjs-nextjs-experimental')

const nextConfig = {
  reactStrictMode: true,
}

// LocatorJS 开发期接线：webpack pre-loader 给每个 JSX 元素注入 data-source="路径:行:列"，
//   @locator/runtime 的 swcAdapter 读它 → Alt(Win)/⌘(mac)+点页面元素直接在编辑器跳到源码行。
// · 用 pre-loader 在 SWC「之前」改源码，SWC 编译链保留 → next/font 照常工作（不像加 Babel 会报错）。
// · enabled 默认 NODE_ENV==='development'，生产构建 locatorJSPlugin() 返回 {}，零注入、不影响线上包。
// · bundler:'webpack' 明确只配 webpack（项目跑 next dev = webpack），避免 Next 14 的 turbopack 键告警。
module.exports = {
  ...nextConfig,
  ...locatorJSPlugin({ bundler: 'webpack' }),
}
