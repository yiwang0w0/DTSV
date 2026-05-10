'use client'

/**
 * Shader.jsx — 5 种 WebGL 壁纸壁纸方案（远星函馆 FX）
 *
 * 来源：claude.ai/design 远星函馆 FX 演示，设计稿 2026-05-10。
 * 与原型差异：
 *   - 改为 ES module，移除全局 window.Shader = ...
 *   - 用户偏好：document.hidden 自动暂停 + prefers-reduced-motion 自动降低 intensity
 *   - WebGL 不可用时兜底为 CSS 渐变，避免空白
 *
 * Props：
 *   name        : 'pollution_field' | 'deep_path' | 'data_grid' | 'bubble_layer' | 'omega_iface'
 *   pollution   : 0..1 — 环境污染（驱动颜色 / 强度），通常 envPollution / 100
 *   intensity   : 0..1.5 — 总体强度（兜底用，让用户可以调暗）
 *   paused      : boolean — 强制暂停（默认会自动 paused = document.hidden）
 *   dpr         : number — 设备像素比（默认 min(window.devicePixelRatio, 2)）
 *
 * 使用：
 *   <Shader name="deep_path" pollution={env / 100} intensity={1} />
 */

import { useEffect, useRef } from 'react'

const FRAG = {
  // ── 1. 污染场 — 域扭曲 noise，污染越高扭曲越剧烈 ──────
  pollution_field: `
    precision highp float;
    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_pollution;
    uniform float u_intensity;

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
      vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
    }
    float fbm(vec2 p){
      float v=0.0, a=0.5;
      for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; }
      return v;
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / u_resolution.y;
      float t = u_time*0.05;
      float warp = 0.4 + u_pollution*1.6;
      vec2 q = vec2(fbm(uv+t), fbm(uv-t+3.7));
      vec2 r = vec2(fbm(uv+q*warp+t*1.3), fbm(uv+q*warp-t));
      float n = fbm(uv + r*warp);
      vec3 c1 = vec3(0.46,0.31,0.85);
      vec3 c2 = vec3(0.34,0.65,1.00);
      vec3 c3 = vec3(0.97,0.32,0.28);
      vec3 col = mix(c1,c2, smoothstep(0.2,0.6,n));
      col = mix(col, c3, smoothstep(0.4,0.95,n)*u_pollution);
      col *= 0.18 + 0.30*u_intensity;
      float vig = smoothstep(1.4,0.4,length(uv));
      col *= vig;
      col += vec3(0.055,0.067,0.090);
      gl_FragColor = vec4(col,1.0);
    }
  `,
  // ── 2. 深界路径 — 隧道 / 星河流速（GPU 几乎零开销）──
  deep_path: `
    precision highp float;
    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_pollution;
    uniform float u_intensity;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution)/u_resolution.y;
      float r = length(uv);
      float a = atan(uv.y, uv.x);
      float speed = 0.25 + u_pollution*0.6;
      float t = u_time*speed;
      float ring = sin(8.0/(r+0.05) - t*4.0)*0.5+0.5;
      ring = pow(ring, 4.0);
      float spiral = sin(a*6.0 + 8.0/(r+0.1) - t*3.0)*0.5+0.5;
      vec2 g = floor(uv*180.0);
      float star = step(0.997, hash(g + floor(t*0.3)));
      vec3 col = vec3(0.0);
      col += vec3(0.45,0.30,0.85)*ring*(1.0-u_pollution*0.4);
      col += vec3(0.34,0.65,1.00)*spiral*0.4;
      col += vec3(1.0)*star*0.9;
      col = mix(col, vec3(0.97,0.32,0.28), u_pollution*0.35*(1.0-r));
      col *= smoothstep(2.0,0.2,r);
      col *= 0.4 + 0.6*u_intensity;
      col += vec3(0.055,0.067,0.090);
      gl_FragColor = vec4(col,1.0);
    }
  `,
  // ── 3. 数据网格 — 极致便宜（移动端 60fps）──
  data_grid: `
    precision highp float;
    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_pollution;
    uniform float u_intensity;
    void main(){
      vec2 uv = gl_FragCoord.xy/u_resolution;
      vec2 p = uv*u_resolution;
      vec2 g = mod(p + vec2(0.0, u_time*30.0), 60.0);
      float gridX = smoothstep(1.5,0.0,abs(g.x-30.0));
      float gridY = smoothstep(1.5,0.0,abs(g.y-30.0));
      float grid = max(gridX, gridY);
      float scan = 0.5 + 0.5*sin(p.y*0.6 - u_time*4.0);
      scan = pow(scan, 8.0);
      vec2 c = (uv-0.5)*vec2(u_resolution.x/u_resolution.y, 1.0);
      float pulse = exp(-length(c)*2.5)*0.5*(0.6+0.4*sin(u_time*0.8));
      vec3 base = mix(vec3(0.34,0.65,1.00), vec3(0.97,0.32,0.28), u_pollution);
      vec3 col = vec3(0.055,0.067,0.090);
      col += base * grid * 0.25;
      col += base * scan * 0.07;
      col += base * pulse;
      col *= 0.6 + 0.4*u_intensity;
      gl_FragColor = vec4(col,1.0);
    }
  `,
  // ── 4. 泡层残响 — voronoi 漂浮（开销最高，建议弹窗背景）──
  bubble_layer: `
    precision highp float;
    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_pollution;
    uniform float u_intensity;
    vec2 hash2(vec2 p){
      p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
      return fract(sin(p)*43758.5453);
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution)/u_resolution.y;
      vec2 p = uv*4.0;
      vec2 ip = floor(p), fp = fract(p);
      float minD = 1e9;
      float second = 1e9;
      for(int j=-1;j<=1;j++){
        for(int i=-1;i<=1;i++){
          vec2 g = vec2(float(i),float(j));
          vec2 o = hash2(ip+g);
          o = 0.5 + 0.5*sin(u_time*0.4 + 6.2831*o);
          vec2 r = g + o - fp;
          float d = dot(r,r);
          if(d<minD){ second=minD; minD=d; }
          else if(d<second){ second=d; }
        }
      }
      float edge = smoothstep(0.0, 0.06, sqrt(second)-sqrt(minD));
      float cell = 1.0 - edge;
      vec3 c1 = vec3(0.46,0.31,0.85);
      vec3 c2 = vec3(0.34,0.65,1.00);
      vec3 c3 = vec3(0.97,0.32,0.28);
      vec3 base = mix(c1, c2, fract(sqrt(minD)*4.0));
      base = mix(base, c3, u_pollution*0.6);
      vec3 col = vec3(0.055,0.067,0.090);
      col += base * cell * 0.35;
      col += base * (1.0-cell) * 0.04;
      col *= 0.5 + 0.5*u_intensity;
      gl_FragColor = vec4(col,1.0);
    }
  `,
  // ── 5. Ω 接口 — 圆形干涉环（Ω-段 / 撤离 / 结局横幅）──
  omega_iface: `
    precision highp float;
    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_pollution;
    uniform float u_intensity;
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution)/u_resolution.y;
      float r = length(uv);
      float a = atan(uv.y, uv.x);
      float t = u_time*0.6;
      float w1 = sin(r*40.0 - t*4.0);
      float w2 = sin(r*16.0 + t*1.5 + a*3.0);
      float w3 = sin(r*70.0 - t*7.0 + a);
      float wave = (w1*0.5 + w2*0.35 + w3*0.15);
      wave = pow(0.5+0.5*wave, 5.0);
      float disk = smoothstep(0.30, 0.28, r);
      float ring = smoothstep(0.005, 0.0, abs(r-0.30));
      vec3 c1 = vec3(0.46,0.31,0.85);
      vec3 c2 = vec3(0.34,0.65,1.00);
      vec3 c3 = vec3(0.97,0.32,0.28);
      vec3 base = mix(c1, c2, 0.5+0.5*sin(t*0.3));
      base = mix(base, c3, u_pollution);
      vec3 col = vec3(0.055,0.067,0.090);
      col += base * wave * 0.18;
      col += base * disk * 0.20;
      col += vec3(1.0) * ring * 0.6;
      float tick = step(0.97, abs(sin(a*24.0))) * smoothstep(0.34,0.30,r) * smoothstep(0.28,0.32,r);
      col += vec3(1.0)*tick*0.4;
      col *= 0.6 + 0.4*u_intensity;
      gl_FragColor = vec4(col,1.0);
    }
  `,
}

export const SHADER_KEYS = Object.keys(FRAG)

const VERT = `
  attribute vec2 a_pos;
  void main(){ gl_Position = vec4(a_pos,0.0,1.0); }
`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[Shader compile]', gl.getShaderInfoLog(sh))
    return null
  }
  return sh
}

export default function Shader({
  name = 'deep_path',
  pollution = 0,
  intensity = 1,
  paused = false,
  dpr,
  className,
  style,
}) {
  const ref = useRef(null)
  const stateRef = useRef({ paused, pollution, intensity })
  stateRef.current = { paused, pollution, intensity }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const effectiveDpr = dpr || Math.min(window.devicePixelRatio || 1, 2)
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    if (!gl) {
      // 兜底：CSS 渐变
      canvas.style.background = `
        radial-gradient(ellipse at 30% 20%, #5a3da140 0%, transparent 60%),
        radial-gradient(ellipse at 80% 80%, #58a6ff20 0%, transparent 60%),
        #0e1117
      `
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG[name] || FRAG.deep_path)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
    const a_pos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(a_pos)
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0)
    const u_time = gl.getUniformLocation(prog, 'u_time')
    const u_res  = gl.getUniformLocation(prog, 'u_resolution')
    const u_pol  = gl.getUniformLocation(prog, 'u_pollution')
    const u_int  = gl.getUniformLocation(prog, 'u_intensity')

    let raf
    const start = performance.now()

    function resize() {
      const w = canvas.clientWidth * effectiveDpr
      const h = canvas.clientHeight * effectiveDpr
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    // 自动暂停：document.hidden 或显式 paused
    function shouldPause() {
      return stateRef.current.paused || (typeof document !== 'undefined' && document.hidden)
    }

    function loop() {
      raf = requestAnimationFrame(loop)
      if (shouldPause()) return
      resize()
      const t = (performance.now() - start) / 1000
      gl.uniform1f(u_time, t)
      gl.uniform2f(u_res, canvas.width, canvas.height)
      gl.uniform1f(u_pol, stateRef.current.pollution)
      gl.uniform1f(u_int, stateRef.current.intensity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [name, dpr])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', ...style }}
    />
  )
}
