/* ────────────────────────────────────────────────────────────
   娃娃机交互动画（无第三方库）

   · 待机：抓夹轻微悬摆呼吸、摇杆小幅摇晃
   · 鼠标移动：摇杆朝鼠标方向倾斜，抓夹沿导轨同方向移动（带惯性）
   · 点击 Hero：抓取动作 ——
       摇杆下按一拍 → 抓夹下降（伸缩杆露出）→ 切 clawcatch1
       → 合爪 clawcatch2（环境光亮一拍）→ 若爪下有产品则夹住一起上升
       → 顶部停稳后松爪，产品落回原位，派发 hero:grab 事件
       （之后接"打开项目页"就监听这个事件）
   · 闲置提示：几秒没动时摇杆自己晃一下、爪子轻微下探，暗示可玩
   · prefers-reduced-motion → 不启动，保持静态

   可调参数集中在 CONFIG（= window.HERO_MACHINE）。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const CONFIG = {
    stickMaxTilt: 25,   // 摇杆跟随鼠标的最大倾角（度）
    stickIdleTilt: 4.5, // 摇杆待机摇晃幅度（度）
    stickIdlePeriod: 3.4,
    clawTravel: 0.28,   // 抓夹左右行程（占机身宽度比例，±）
    controlZone: 1.0,   // 鼠标控制区宽度（占机身宽度倍数）：机身左缘→最左，右缘→最右
    clawIdleBob: 0.009, // 待机上下呼吸幅度（占机身高度比例）
    clawIdlePeriod: 5.6,
    followInertia: 5.0, // 鼠标跟随惯性（越小越慢）
    dropDepth: 0.18,    // 抓取下降深度（占机身高度比例，≤0.19 保证杆顶不露出机檐）
    dropTime: 0.9,      // 下降时长（秒）
    holdTime: 0.4,      // 底部合爪停留（秒）
    riseTime: 1.1,      // 上升时长（秒）
    grabRange: 0.1,     // 判定"爪下有产品"的水平距离（占机身宽度比例）
    hintAfter: 7,       // 闲置多少秒后开始提示
    hintEvery: [9, 15], // 之后每隔多久提示一次（区间随机）
  };
  window.HERO_MACHINE = CONFIG;

  const hero = document.getElementById("hero");
  const rig = document.querySelector(".machine-rig");
  const claw = document.getElementById("claw-group");
  const clawFront = document.getElementById("claw-group-front"); // 右爪（在产品前层）
  const stick = document.getElementById("joystick-stick");
  const frames = {
    open: [document.getElementById("claw-open-l"), document.getElementById("claw-open-r")],
    catch1: [document.getElementById("claw-catch1-l"), document.getElementById("claw-catch1-r")],
    catch2: [document.getElementById("claw-catch2-l"), document.getElementById("claw-catch2-r")],
  };
  if (!hero || !rig || !claw || !stick) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;
  const finePointer = matchMedia("(pointer: fine)").matches;

  /* 只有四个作品大类可被抓取，其余是玻璃罩里的装饰品 */
  const GRABBABLE = ["app_left", "app_right", "burgerbox", "Glowyin"];
  /* 各产品图顶部透明边距占比（吸附时按可见内容对位） */
  const PAD_TOP = { app_left: 0.012, app_right: 0.022, burgerbox: 0.154, Glowyin: 0 };
  const products = [...document.querySelectorAll(".machine-products > img")].filter((p) =>
    GRABBABLE.some((n) => (p.getAttribute("src") || "").includes(n))
  );
  const padTopOf = (el) => {
    const src = el.getAttribute("src") || "";
    const key = GRABBABLE.find((n) => src.includes(n));
    return PAD_TOP[key] || 0;
  };

  function showFrame(name) {
    for (const key of Object.keys(frames)) {
      for (const el of frames[key]) {
        if (el) el.hidden = key !== name;
      }
    }
  }

  /* ── 鼠标输入（-1 … 1，带惯性） ── */
  const input = { tx: 0, x: 0, ta: 0, a: 0 };
  CONFIG._input = input; // 调试用
  let pressT = -9; // 摇杆下按时刻（点击反馈）
  if (finePointer) {
    window.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      /* 控制区 = 机身宽度 × controlZone：鼠标在机身范围内即可驱动全行程 */
      const rigRect = rig.getBoundingClientRect();
      const half = (rigRect.width * CONFIG.controlZone) / 2;
      const dx = e.clientX - (rigRect.left + rigRect.width / 2);
      input.tx = Math.max(-1, Math.min(1, dx / half));
      input.ta = 1;
    });
    document.addEventListener("pointerleave", () => {
      input.tx = 0;
      input.ta = 0;
    });
  }

  /* ── 抓取状态 ──
     drop 阶段的 0→1→1→0 进程改由 GSAP timeline 驱动
     （dropState.v 是它写入的代理值，主循环每帧原样读取，
     跟手/待机/摇杆等连续动画完全不受影响） */
  const clawPos = { x: 0, y: 0 };        // 当前帧抓夹位移（px）
  const dropState = { v: 0 };            // GSAP 驱动的下降进程代理（0~1）
  let grabTL = null;                     // 当前抓取时间轴
  let grabTarget = null;                 // 底部判定到的产品
  let grabbed = null;                    // {el, x0, y0} 被夹住的产品
  let pulseT = -9;                       // 环境光脉冲开始时刻

  const easeInOut = (p) => p * p * (3 - 2 * p);

  /* 抓取时间轴：下降 → 切帧+判定目标 → 停留合爪 → 切帧+吸附产品+光脉冲
     → 上升 → 停留 → 松爪归位。阶段顺序、每段时长与原状态机完全一致，
     只是从手写 dt 比较换成 gsap.timeline() 的 label/回调序列。 */
  function playGrab() {
    if (grabTL && grabTL.isActive()) return; // 抓取中忽略新点击
    const { dropTime, holdTime, riseTime } = CONFIG;
    grabTL = gsap.timeline()
      .to(dropState, { v: 1, duration: dropTime, ease: "power2.inOut" })
      .call(() => {
        showFrame("catch1");
        grabTarget = findTarget();
      })
      .to({}, { duration: holdTime }) // 纯停留，对应原 hold 阶段
      .call(() => {
        showFrame("catch2");
        attachGrabbed();
        pulseT = performance.now() / 1000;
        if (window.HERO_BG) window.HERO_BG._pulseBase = window.HERO_BG.master;
      })
      .to(dropState, { v: 0, duration: riseTime, ease: "power2.inOut" })
      .to({}, { duration: 0.45 }) // 对应原 settle 阶段
      .call(() => {
        showFrame("open");
        releaseProduct();
      });
  }

  hero.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a, .hero-bg-panel")) return;
    pressT = performance.now() / 1000;
    playGrab();
  });

  /* 爪下最近的产品（水平距离在判定范围内） */
  function findTarget() {
    const rigRect = rig.getBoundingClientRect();
    const axisX = rigRect.left + rigRect.width * 0.4986 + clawPos.x;
    let best = null;
    let bestD = rigRect.width * CONFIG.grabRange;
    for (const p of products) {
      const r = p.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - axisX);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /* 松爪：产品从当前位置落回原位 */
  function releaseProduct() {
    if (!grabbed) return;
    const dx = clawPos.x - grabbed.x0 + grabbed.sx;
    const dy = clawPos.y - grabbed.y0 + grabbed.sy;
    const el = grabbed.el;
    el.style.transform = "";
    el.animate(
      [{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: "translate(0px, 0px)" }],
      { duration: 700, easing: "cubic-bezier(.35,.6,.3,1.12)" }
    );
    /* 之后"打开项目页"监听这个事件即可拿到被抓的产品 */
    hero.dispatchEvent(new CustomEvent("hero:grab", { detail: { src: el.getAttribute("src") } }));
    grabbed = null;
  }

  /* 合爪瞬间：夹住产品，吸附到标准抓握位——水平对齐爪轴，产品
     "可见内容"的顶边落在爪指区上段 35% 处（只遮爪指、爪体全露，
     右爪在前、左爪在后 → 被夹住的空间感）。由 playGrab() 的
     timeline 在 hold→rise 转换点调用，逻辑与原状态机完全一致。 */
  function attachGrabbed() {
    if (!grabTarget) return;
    const bodyR = claw.querySelector(".claw-body").getBoundingClientRect();
    const clawR = claw.getBoundingClientRect();
    const pr = grabTarget.getBoundingClientRect();
    const fingerH = clawR.bottom - bodyR.bottom;
    const targetVisibleTop = bodyR.bottom + fingerH * 0.35;
    const visibleTop = pr.top + padTopOf(grabTarget) * pr.height;
    grabbed = {
      el: grabTarget,
      x0: clawPos.x,
      y0: clawPos.y,
      sx: bodyR.left + bodyR.width * 0.497 - (pr.left + pr.width / 2),
      sy: targetVisibleTop - visibleTop,
      tAttach: performance.now() / 1000,
    };
    grabTarget = null;
  }

  /* ── 主循环 ── */
  let last = performance.now();
  let hintT = -9;      // 当前提示动作开始时刻
  let nextHintAt = null;

  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = now / 1000;

    const k = 1 - Math.exp(-dt * CONFIG.followInertia);
    input.x += (input.tx - input.x) * k;
    input.a += (input.ta - input.a) * k;

    const rigRect = rig.getBoundingClientRect();

    /* 闲置提示：没有鼠标活动且不在抓取中，周期性晃摇杆 + 爪子下探 */
    if (nextHintAt === null) nextHintAt = t + CONFIG.hintAfter;
    if (input.a > 0.15 || (grabTL && grabTL.isActive())) {
      nextHintAt = t + CONFIG.hintAfter;
    } else if (t > nextHintAt) {
      hintT = t;
      nextHintAt = t + CONFIG.hintEvery[0] + Math.random() * (CONFIG.hintEvery[1] - CONFIG.hintEvery[0]);
    }
    let hintRot = 0;
    let hintDip = 0;
    const he = t - hintT;
    if (he >= 0 && he < 1.4) {
      const hp = he / 1.4;
      hintRot = Math.sin(hp * Math.PI * 3) * 9 * (1 - hp);       // 摇杆晃两下,渐弱
      hintDip = Math.sin(Math.min(hp * 1.6, 1) * Math.PI) * rigRect.height * 0.015; // 爪子轻探
    }

    /* 摇杆：待机摇晃 ↔ 跟随鼠标倾斜；点击时下按一拍 */
    const idleStick = Math.sin((6.2832 * t) / CONFIG.stickIdlePeriod) * CONFIG.stickIdleTilt;
    const stickRot = idleStick * (1 - input.a) + input.x * CONFIG.stickMaxTilt * input.a + hintRot;
    /* 下按用 scaleY 从底部压缩（transform-origin 在杆底附近）：
       球头下沉、杆底不动，不会从底座下漏出来 */
    const pe = t - pressT;
    const press = pe >= 0 && pe < 0.28 ? Math.sin((pe / 0.28) * Math.PI) * 0.08 : 0;
    stick.style.transform = `rotate(${stickRot.toFixed(3)}deg) scaleY(${(1 - press).toFixed(3)})`;

    /* 抓夹：水平跟随 + 呼吸 + 抓取下降 + 闲置轻探 */
    const bob = Math.sin((6.2832 * t) / CONFIG.clawIdlePeriod) * CONFIG.clawIdleBob * rigRect.height;
    const x = input.x * input.a * CONFIG.clawTravel * rigRect.width;
    const drop = dropState.v * CONFIG.dropDepth * rigRect.height;
    clawPos.x = x;
    clawPos.y = bob + drop + hintDip;
    const clawTf = `translate(${clawPos.x.toFixed(2)}px, ${clawPos.y.toFixed(2)}px)`;
    claw.style.transform = clawTf;
    if (clawFront) clawFront.style.transform = clawTf;

    /* 被夹住的产品跟着爪子走（吸附量在 0.25 秒内柔和补齐） */
    if (grabbed) {
      const s = easeInOut(Math.min((t - grabbed.tAttach) / 0.25, 1));
      grabbed.el.style.transform =
        `translate(${(clawPos.x - grabbed.x0 + grabbed.sx * s).toFixed(2)}px, ` +
        `${(clawPos.y - grabbed.y0 + grabbed.sy * s).toFixed(2)}px)`;
    }

    /* 合爪瞬间的环境光脉冲（0.9 秒，结束后恢复原值） */
    const bg = window.HERO_BG;
    if (bg && bg._pulseBase !== undefined) {
      const pp = t - pulseT;
      if (pp >= 0 && pp < 0.9) {
        bg.master = bg._pulseBase + Math.sin((pp / 0.9) * Math.PI) * 0.3;
      } else if (pp >= 0.9) {
        bg.master = bg._pulseBase;
        delete bg._pulseBase;
      }
    }
  }
  requestAnimationFrame(loop);
})();
