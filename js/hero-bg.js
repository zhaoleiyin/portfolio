/* ────────────────────────────────────────────────────────────
   Hero 环境光背景（WebGL，无第三方库）

   结构：
   · 三个光区（左 / 中 / 右下主光），每区由 3 层不同尺度的
     高斯柔光组成，经低频 domain-warp 扭曲成不规则自然光域
   · 每层以不同周期缓慢呼吸（半径 / 透明度 / 边缘）
   · 鼠标只以约 5% 的位移带惯性地影响光照重心，不追踪鼠标
   · prefers-reduced-motion → 渲染一帧静态光照
   · WebGL 不可用 → CSS radial-gradient 静态降级

   所有可调参数集中在下方 CONFIG（= window.HERO_BG）。
   快捷键：D 调试面板，B 对比纯黑。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  /* ============ 可调参数 ============ */
  const CONFIG = {
    master: 1.25,       // 整体光照强度
    baseLift: 1.0,      // 整体背景亮度（基础黑的深浅）
    warp: 0.14,         // 光域不规则程度（0 = 规则椭圆）
    breathScale: 0.16,  // 呼吸：半径幅度（≈ ±16%）
    breathOpacity: 0.30, // 呼吸：透明度幅度（≈ ±30%）
    breathSpeed: 1.3,   // 呼吸整体速度倍率（周期 8~14s 基准）
    drift: 0.10,        // 呼吸：光心缓慢椭圆漂移的半径（空间呼吸感）
    mouseFollow: 0.20,  // 光场随鼠标重排的幅度（光心最大位移，占画面比例）
    mouseGlow: 0.60,    // 鼠标方位的光带舒张增亮强度（0 = 关闭）
    mouseAzimuth: 1.0,  // 亮度重心随鼠标聚集的强度（0 = 关闭，>1 更夸张）
    mouseInertia: 3.0,  // 鼠标惯性（越小越慢、越"迟半拍"）
    zones: {
      // x: 水平位置(0~1)  y: 垂直位置(0~1, 自底部)  size: 光域大小
      // intensity: 亮度   angle: 光带倾斜角(度, 沿长轴, 逆时针自水平)
      left:   { x: 0.30, y: 0.20, size: 1.0, intensity: 0.35, angle: 68 },
      center: { x: 0.58, y: 0.16, size: 1.0, intensity: 0.55, angle: 56 },
      right:  { x: 0.90, y: 0.18, size: 1.0, intensity: 1.0,  angle: 76 },
    },
  };
  window.HERO_BG = CONFIG;

  const hero = document.getElementById("hero");
  const canvas = document.getElementById("hero-bg-canvas");
  if (!hero || !canvas) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;

  /* ============ Shader ============ */
  const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

  const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;        // 已平滑，[-0.5, 0.5]
uniform float u_master;
uniform float u_baseLift;
uniform float u_warp;
uniform float u_breathScale;
uniform float u_breathOpacity;
uniform float u_breathSpeed;
uniform float u_drift;
uniform float u_follow;
uniform float u_glow;
uniform float u_active;       // 鼠标活跃度(0~1) × 聚集强度
uniform vec4  u_left;         // x, y, size, intensity
uniform vec4  u_center;
uniform vec4  u_right;
uniform vec3  u_angle;        // 三个光带的倾斜角（弧度）：left / center / right

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),                 hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.13, 9.57);
    a *= 0.5;
  }
  return v;
}

/* 方位权重：光带水平位置 bx 离鼠标方位越近权重越高（1.55），越远越暗（0.40） */
float azWeight(float bx, float mx) {
  float d = (bx - mx) / 0.35;
  return mix(1.0, mix(0.40, 1.55, exp(-d * d)), u_active);
}

vec2 rot2(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

/* 单层柔光：可旋转的高斯衰减（无边界、无轮廓）
   每层有三重独立呼吸：半径胀缩 + 透明度起伏 + 光心缓慢椭圆漂移 */
float layerLight(vec2 p, vec2 c, vec2 radii, float ang, float period, float phase) {
  float t = u_time * u_breathSpeed;
  float s = 1.0 + u_breathScale   * sin(6.2831853 * t / period + phase);
  float o = 1.0 + u_breathOpacity * sin(6.2831853 * t / (period * 1.31) + phase * 1.7);
  /* 光心漂移：两轴周期不同 → 缓慢的不闭合椭圆轨迹，看不出循环 */
  vec2 drift = u_drift * vec2(
    sin(6.2831853 * t / (period * 1.93) + phase * 2.3),
    sin(6.2831853 * t / (period * 2.41) + phase * 3.1)
  );
  vec2 q = rot2(p - c - drift, -ang) / (radii * s);
  float g = exp(-dot(q, q));
  /* 锐化：亮核更实、尾部收得更快 → 读作"光"而不是"雾" */
  g = 0.62 * g * g + 0.38 * g;
  /* 方向性：光从光带底端（光源侧）射入，沿长轴向末端自然衰减 */
  g *= mix(1.45, 0.55, smoothstep(-1.15, 1.15, q.x));
  return g * o;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  /* 低频 domain-warp：让光域不规则、像空气一样缓慢流动
     扭曲幅度自身也在呼吸 → 光的边缘会自然变软和收拢 */
  float tw = u_time * 0.10 * u_breathSpeed;
  float wAmp = u_warp * (1.0 + 0.5 * sin(6.2831853 * u_time * u_breathSpeed / 14.3 + 1.1));
  /* 鼠标写进噪声域：两个分量随鼠标滑动的方向/权重不同
     → 光斑的形状随鼠标"流动变形"，而不是整块平移 */
  vec2 mw = u_mouse * 0.45;
  vec2 wp = p + wAmp * (vec2(
    fbm(p * 1.4 + vec2(tw, 0.3 * tw) + mw * 0.7),
    fbm(p * 1.4 + vec2(31.7, 13.1) - vec2(0.4 * tw, tw) - mw)
  ) - 0.5);

  /* 鼠标：光照重心偏移（各层幅度不同 → 空间视差感；垂直分量衰减） */
  vec2 mDamp = vec2(1.0, 0.55);
  vec2 m1 = u_mouse * u_follow * 0.6 * mDamp;
  vec2 m2 = u_mouse * u_follow * 1.0 * mDamp;
  vec2 m3 = u_mouse * u_follow * 1.5 * mDamp;

  /* ── 基础黑：与娃娃机机身同色 #0A0A0A（0.0392），仅保留不可见的微起伏 ── */
  float base = 0.0392;
  base += 0.004 * (fbm(p * 0.9 + vec2(3.3, 7.7)) - 0.5);
  vec3 light = vec3(0.0);

  /* 方位权重：亮度重心跟着鼠标走——离鼠标近的光带成为主光，
     远的明显退暗；鼠标离开后 u_active→0，回到默认布光 */
  float mx = 0.5 + u_mouse.x;

  /* ── 左侧：大面积低亮度暖灰白柔光（弱、宽、略斜） ── */
  {
    vec2 c = vec2(u_left.x * aspect, u_left.y);
    float sz = u_left.z;
    /* 各光带响应幅度、倾斜角都不同 → 光场形变而非整体平移 */
    float a = u_angle.x + u_mouse.x * 0.06;
    float v = 0.0;
    v += 0.070 * layerLight(wp, c + m1 * 0.5,                       vec2(0.62, 0.36) * sz, a, 12.6, 0.0);
    v += 0.150 * layerLight(wp, c + m2 * 0.5 + rot2(vec2( 0.10,  0.03), a), vec2(0.46, 0.22) * sz, a,  9.8, 2.1);
    v += 0.130 * layerLight(wp, c + m3 * 0.5 + rot2(vec2(-0.06, -0.02), a), vec2(0.26, 0.11) * sz, a, 13.9, 4.4);
    /* 鼠标活跃时底层亮度拉平（mix→1.0），谁亮完全由方位权重决定 */
    light += vec3(1.0, 0.975, 0.945) * (v * mix(u_left.w, 1.0, clamp(u_active, 0.0, 1.0)) * azWeight(u_left.x, mx));
  }

  /* ── 中右：较亮的斜向光带，自底部向右上延伸 ── */
  {
    vec2 c = vec2(u_center.x * aspect, u_center.y);
    float sz = u_center.z;
    float a = u_angle.y + u_mouse.x * 0.10;
    float v = 0.0;
    v += 0.070 * layerLight(wp, c + m1,                            vec2(0.66, 0.32) * sz, a, 11.4, 1.3);
    v += 0.150 * layerLight(wp, c + m2 + rot2(vec2( 0.08,  0.02), a), vec2(0.52, 0.20) * sz, a,  8.6, 3.6);
    v += 0.130 * layerLight(wp, c + m3 + rot2(vec2( 0.18, -0.02), a), vec2(0.30, 0.10) * sz, a, 13.2, 5.9);
    light += vec3(0.985, 0.985, 0.98) * (v * mix(u_center.w, 1.0, clamp(u_active, 0.0, 1.0)) * azWeight(u_center.x, mx));
  }

  /* ── 右缘：最亮的光带，贴右边缘、从右下角向上延伸 ── */
  {
    vec2 c = vec2(u_right.x * aspect, u_right.y);
    float sz = u_right.z;
    float a = u_angle.z + u_mouse.x * 0.15;
    float v = 0.0;
    v += 0.070 * layerLight(wp, c + m1 * 1.4,                       vec2(0.62, 0.36) * sz, a, 13.4, 0.7);
    v += 0.160 * layerLight(wp, c + m2 * 1.4 + rot2(vec2( 0.10,  0.03), a), vec2(0.52, 0.22) * sz, a, 10.6, 2.9);
    v += 0.150 * layerLight(wp, c + m3 * 1.4 + rot2(vec2( 0.20, -0.03), a), vec2(0.30, 0.11) * sz, a,  8.9, 5.2);
    light += vec3(0.93, 0.965, 1.0) * (v * mix(u_right.w, 1.0, clamp(u_active, 0.0, 1.0)) * azWeight(u_right.x, mx));
  }

  /* 鼠标方位的光带舒张增亮：以鼠标为光源方位，靠近它的光带
     变亮变宽、远离的收暗（乘法增益，暗区不会被点亮成光斑） */
  vec2 mpos = vec2((0.5 + u_mouse.x) * aspect, 0.5 + u_mouse.y);
  vec2 md = (p - mpos) / vec2(0.95, 0.75);
  float prox = exp(-dot(md, md));
  light *= 1.0 - u_glow * 0.35 + u_glow * prox;

  /* 顶部衰减：光带在上半部始终保持较暗 */
  float topFade = 1.0 - 0.8 * smoothstep(0.45, 0.95, uv.y);
  light *= topFade;

  /* 对比曲线：压低弱光尾部（去雾），保留亮核 */
  light = pow(max(light, vec3(0.0)), vec3(1.22));

  /* u_master 只缩放光照部分，不影响基础黑 */
  vec3 col = vec3(base) * u_baseLift + light * u_master;

  /* 柔和压制高光，避免任何区域接近实体白块 */
  col = col / (1.0 + col * 0.35);

  /* 1/255 静态抖动：消除近黑渐变的色阶断层（不可见，非噪点效果） */
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

  /* ============ WebGL 初始化 ============ */
  const gl =
    canvas.getContext("webgl", { antialias: false, alpha: false, depth: false }) ||
    canvas.getContext("experimental-webgl");

  if (!gl) {
    hero.classList.add("hero-bg-fallback");
    return;
  }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("hero-bg shader:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    hero.classList.add("hero-bg-fallback");
    return;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  [
    "u_res", "u_time", "u_mouse", "u_master", "u_baseLift", "u_warp",
    "u_breathScale", "u_breathOpacity", "u_breathSpeed", "u_drift", "u_follow", "u_glow", "u_active",
    "u_left", "u_center", "u_right", "u_angle",
  ].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

  /* ============ 尺寸（Retina 清晰，DPR 上限 2） ============ */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(hero.clientWidth * dpr);
    const h = Math.round(hero.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  resize();
  window.addEventListener("resize", () => {
    resize();
    if (reducedMotion) renderFrame(3.0);
  });

  /* ============ 鼠标（惯性 lerp，慢半拍）============
     鼠标即光源：光源中心跟随平滑后的鼠标位置。
     REST = 无鼠标时光源的默认停靠位置（画面 72% 宽、30% 高处）。 */
  /* REST = 无鼠标时的默认光场状态（0,0 即设计好的默认布光）
     active：鼠标在页面内为 1（亮度重心跟随鼠标），离开后缓慢回到 0 */
  const REST = { x: 0, y: 0 };
  const mouse = { tx: REST.x, ty: REST.y, x: REST.x, y: REST.y, ta: 0, a: 0 };
  CONFIG._mouse = mouse; // 调试用：window.HERO_BG._mouse
  if (finePointer && !reducedMotion) {
    window.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      mouse.tx = (e.clientX - r.left) / r.width - 0.5;
      mouse.ty = 0.5 - (e.clientY - r.top) / r.height; // y 向上为正
      mouse.ta = 1;
    });
    document.addEventListener("pointerleave", () => {
      mouse.tx = REST.x;
      mouse.ty = REST.y;
      mouse.ta = 0;
    });
    window.addEventListener("blur", () => {
      mouse.tx = REST.x;
      mouse.ty = REST.y;
      mouse.ta = 0;
    });
  }

  /* ============ 渲染 ============ */
  function renderFrame(t) {
    const z = CONFIG.zones;
    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    gl.uniform1f(U.u_time, t);
    gl.uniform2f(U.u_mouse, mouse.x, mouse.y);
    gl.uniform1f(U.u_master, CONFIG.master);
    gl.uniform1f(U.u_baseLift, CONFIG.baseLift);
    gl.uniform1f(U.u_warp, CONFIG.warp);
    gl.uniform1f(U.u_breathScale, CONFIG.breathScale);
    gl.uniform1f(U.u_breathOpacity, CONFIG.breathOpacity);
    gl.uniform1f(U.u_breathSpeed, CONFIG.breathSpeed);
    gl.uniform1f(U.u_drift, CONFIG.drift);
    gl.uniform1f(U.u_follow, CONFIG.mouseFollow);
    gl.uniform1f(U.u_glow, CONFIG.mouseGlow);
    gl.uniform1f(U.u_active, mouse.a * CONFIG.mouseAzimuth);
    gl.uniform4f(U.u_left, z.left.x, z.left.y, z.left.size, z.left.intensity);
    gl.uniform4f(U.u_center, z.center.x, z.center.y, z.center.size, z.center.intensity);
    gl.uniform4f(U.u_right, z.right.x, z.right.y, z.right.size, z.right.intensity);
    const D2R = Math.PI / 180;
    gl.uniform3f(U.u_angle, z.left.angle * D2R, z.center.angle * D2R, z.right.angle * D2R);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  if (reducedMotion) {
    /* 静态降级：一帧固定光照，无呼吸、无跟随 */
    console.info(
      "hero-bg: 检测到系统开启了「减弱动态效果」(prefers-reduced-motion)，" +
      "背景以静态方式渲染。关闭该系统设置后刷新即可看到呼吸动画。"
    );
    renderFrame(3.0);
  } else {
    console.info("hero-bg: 环境光动画运行中（呼吸 + 鼠标惯性响应）。按 D 打开调试面板，按 B 对比纯黑。");
    let last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      /* 帧率无关的惯性：光比鼠标慢半拍 */
      const k = 1 - Math.exp(-dt * CONFIG.mouseInertia);
      mouse.x += (mouse.tx - mouse.x) * k;
      mouse.y += (mouse.ty - mouse.y) * k;
      mouse.a += (mouse.ta - mouse.a) * k;
      renderFrame(now / 1000);
    }
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    hero.classList.add("hero-bg-fallback");
  });

  /* ============ 调试面板（D 键）与纯黑对比（B 键） ============ */
  let panel = null;

  function slider(labelText, min, max, step, get, set) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = get();
    const out = document.createElement("output");
    out.textContent = Number(get()).toFixed(step < 0.01 ? 3 : 2);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      set(v);
      out.textContent = v.toFixed(step < 0.01 ? 3 : 2);
      if (reducedMotion) renderFrame(3.0);
    });
    label.append(span, input, out);
    return label;
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "hero-bg-panel";

    const addTitle = (t) => {
      const h = document.createElement("h4");
      h.textContent = t;
      panel.appendChild(h);
    };

    addTitle("整体");
    panel.append(
      slider("整体光强", 0, 2, 0.01, () => CONFIG.master, (v) => (CONFIG.master = v)),
      slider("背景亮度", 0.5, 1.5, 0.01, () => CONFIG.baseLift, (v) => (CONFIG.baseLift = v)),
      slider("不规则度", 0, 0.3, 0.005, () => CONFIG.warp, (v) => (CONFIG.warp = v)),
    );

    addTitle("呼吸");
    panel.append(
      slider("半径幅度", 0, 0.35, 0.001, () => CONFIG.breathScale, (v) => (CONFIG.breathScale = v)),
      slider("透明度幅度", 0, 0.6, 0.001, () => CONFIG.breathOpacity, (v) => (CONFIG.breathOpacity = v)),
      slider("速度", 0.2, 2.5, 0.01, () => CONFIG.breathSpeed, (v) => (CONFIG.breathSpeed = v)),
      slider("光心漂移", 0, 0.25, 0.001, () => CONFIG.drift, (v) => (CONFIG.drift = v)),
    );

    addTitle("鼠标");
    panel.append(
      slider("光场重排幅度", 0, 0.6, 0.005, () => CONFIG.mouseFollow, (v) => (CONFIG.mouseFollow = v)),
      slider("方位增亮", 0, 1.5, 0.01, () => CONFIG.mouseGlow, (v) => (CONFIG.mouseGlow = v)),
      slider("亮度重心聚集", 0, 1.5, 0.01, () => CONFIG.mouseAzimuth, (v) => (CONFIG.mouseAzimuth = v)),
      slider("惯性(小=慢)", 0.5, 6, 0.05, () => CONFIG.mouseInertia, (v) => (CONFIG.mouseInertia = v)),
    );

    const zoneNames = { left: "左侧光区", center: "中部光区", right: "右下主光" };
    for (const key of ["left", "center", "right"]) {
      const z = CONFIG.zones[key];
      addTitle(zoneNames[key]);
      panel.append(
        slider("强度", 0, 2, 0.01, () => z.intensity, (v) => (z.intensity = v)),
        slider("水平位置", -0.2, 1.2, 0.005, () => z.x, (v) => (z.x = v)),
        slider("垂直位置", -0.2, 1.2, 0.005, () => z.y, (v) => (z.y = v)),
        slider("光域大小", 0.4, 2, 0.01, () => z.size, (v) => (z.size = v)),
        slider("倾斜角度", 0, 180, 1, () => z.angle, (v) => (z.angle = v)),
      );
    }

    const toggle = document.createElement("label");
    toggle.className = "panel-toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !hero.classList.contains("bg-off");
    cb.addEventListener("change", () => hero.classList.toggle("bg-off", !cb.checked));
    const txt = document.createElement("span");
    txt.textContent = "环境光开启（B 键对比纯黑）";
    toggle.append(cb, txt);
    panel.appendChild(toggle);

    document.body.appendChild(panel);
    panel.style.display = "none";
  }

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "d") {
      if (!panel) buildPanel();
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    } else if (k === "b") {
      hero.classList.toggle("bg-off");
      if (panel) {
        const cb = panel.querySelector(".panel-toggle input");
        if (cb) cb.checked = !hero.classList.contains("bg-off");
      }
    }
  });
})();
