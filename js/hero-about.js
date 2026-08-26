/* ────────────────────────────────────────────────────────────
   Hero → About 过渡：摄影机在同一个黑色摄影棚里移动

   架构（GSAP + ScrollTrigger 接入后）：
   · pS（平滑滚动进度）现在由一个 ScrollTrigger 的 scrub 提供——
     GSAP 接管"滚动 → 平滑进度"这条链路（之前是手写指数平滑）。
   · 其余所有公式（T 材质窗口、机器缩放/透明度、背景渐熄、
     贴纸淡出/减速）完全不变，只是从"自己算 pS"改成"读 ScrollTrigger
     算好的 pS"，视觉效果不受影响。
   · 滚动速度 vel 仍按原方式手动跟踪（用于工牌待机摆动、机器微摆
     这类需要每帧响应"当前速度"的连续物理，不适合用一次性 tween
     表达，继续留在 rAF 里）。
   · 工牌的"触碰/拖拽后回弹"改用 GSAP 弹性缓动（elastic/back）
     一次性 tween 实现，取代原本手写的二阶阻尼弹簧数值积分；
     未在回弹动画中、也没有被拖拽时，仍由一个轻量弹簧驱动"随滚动
     速度产生的待机摆动"（这是持续跟随一个活的目标值，不是一次性
     动画，不适合迁移到 GSAP tween）。

   统一材质语言（每层错峰，来源于 T = win(pS, 0.12, 0.82)）：
     先浮现极轻 Halftone（点孔 10~15%，只是材质不是特效）
     → 边缘逐渐溶解 → 自然消失（不是直接 fade）

     标题/文字   永不参与（只随页面正常滚动）
     娃娃机主体  T 0→1（缩小到 0.90、继续上移离场、
                        随滚动速度轻微摆动回弹；铭牌随行）
     柔光/背景   T 0→1（渐熄 + 光斑网点质感；黑底穿孔不可见）
     漂浮贴纸   pS 0.5→1.05（最后收场）

   工牌：与右侧文字实测对齐纵向中线。
   静止第一屏：一切卸载，Hero 100% 原版。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const hero = document.getElementById("hero");
  const about = document.getElementById("about");
  const badge = document.getElementById("about-badge");
  const aboutText = document.querySelector(".about-text");
  const machineRig = document.querySelector(".machine-rig");
  const content = document.querySelector(".hero-content");
  const ambient = document.querySelector(".layer-ambient");
  const floatBack = document.getElementById("float-back");
  const floatFront = document.getElementById("float-front");
  if (!hero || !about) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const clamp01 = (v) => clamp(v, 0, 1);
  const smooth = (v) => v * v * (3 - 2 * v);
  const win = (p, s, e) => smooth(clamp01((p - s) / (e - s)));

  /* ── 工牌与文字的真实纵向对齐：卡片中心 = 文字块中心
     绳长显式计算 = 挂件总高 − (金属扣 + 卡片 − 重叠量) ── */
  function alignBadge() {
    if (!badge || !aboutText) return;
    const rope = badge.querySelector(".badge-rope");
    const lower = badge.querySelector(".badge-lower");
    const bw = badge.offsetWidth;
    const textR = aboutText.getBoundingClientRect();
    const aboutR = about.getBoundingClientRect();
    const textCenter = textR.top + textR.height / 2 - aboutR.top;
    const lowerH = lower.offsetHeight || bw * 1.885;
    /* 卡片中心位于下段高度的 62.5% 处（自下段顶起算） */
    const badgeH = textCenter + lowerH * 0.3748;
    badge.style.height = badgeH.toFixed(0) + "px";
    rope.style.height = Math.max(30, badgeH - lowerH).toFixed(0) + "px";
  }
  addEventListener("resize", alignBadge);
  addEventListener("load", alignBadge);
  alignBadge();
  setTimeout(alignBadge, 300); /* 素材加载后再校一次 */

  /* 漂浮贴纸的下落减速：调整 WAAPI 动画播放速率 */
  let floatRate = 1;
  function setFloatRate(layer, rate) {
    if (!layer) return;
    for (const a of layer.getAnimations({ subtree: true })) a.playbackRate = rate;
  }

  /* ── 工牌悬挂物理 ──
     两套机制分工，共用同一个 badgeRot/badgeLag 状态，互斥执行：

     1) 待机摆动（持续物理，仍用手写弹簧）：随"当前滚动速度"连续
        变化的目标角度，弹簧每帧追一次——这是追一个活的目标值，
        GSAP 的 tween 面向"到某个终点"，不适合表达这种连续追踪。
        欠阻尼二阶弹簧：摆角 k=81(ω0=9) c=6.3(ζ≈0.35)，
        垂直 k=49(ω0=7) c=9.1(ζ≈0.65)。

     2) 触碰/拖拽松手后的回弹（一次性动画，交给 GSAP）：改用
        elastic/back 缓动的一次性 tween，取代原本"注入角速度、
        交给弹簧数值积分"的写法——这正是 GSAP 缓动函数的强项。
        回弹 tween 播放期间暂停机制 1），播完自动交还。 */
  function springStep(pos, vel, target, k, c, dt) {
    const accel = -k * (pos - target) - c * vel;
    const nv = vel + accel * dt;
    return [pos + nv * dt, nv];
  }

  let badgeRot = 0, badgeRotVel = 0;  // 工牌摆角（弹簧状态 / GSAP tween 共用）
  let badgeLag = 0, badgeLagVel = 0;  // 工牌垂直迟滞（同上）
  let badgeReboundTL = null;          // 当前回弹 tween（存在且 isActive 时暂停弹簧）

  function applyBadgeTransform(breath) {
    badge.style.transform =
      `translateY(${(badgeLag + breath).toFixed(2)}px) rotate(${badgeRot.toFixed(3)}deg)`;
  }

  /* 触碰/拖拽松手都调用这个：从当前角度改用弹性缓动回落到 0，
     初始位移量决定"甩多远"，elastic 的振荡自然给出 1~2 次余震 */
  function reboundBadge(extraRot, extraLag) {
    if (!hasGSAP) return false;
    if (badgeReboundTL) badgeReboundTL.kill();
    const proxy = { rot: badgeRot + extraRot, lag: badgeLag + extraLag };
    badgeRotVel = 0;
    badgeLagVel = 0;
    badgeReboundTL = gsap.timeline({
      onUpdate: () => {
        badgeRot = proxy.rot;
        badgeLag = proxy.lag;
      },
      onComplete: () => {
        badgeReboundTL = null;
      },
    });
    badgeReboundTL
      .fromTo(proxy, { rot: proxy.rot }, { rot: 0, duration: 1.15, ease: "elastic.out(1, 0.32)" }, 0)
      .fromTo(proxy, { lag: proxy.lag }, { lag: 0, duration: 0.85, ease: "back.out(1.6)" }, 0);
    return true;
  }

  /* ── 工牌触碰：点击/轻按就有反应，像用手指碰了它一下 ──
     按下的瞬间立即给一个"甩开"的初始位移，交给 reboundBadge() 的
     弹性缓动回落（方向取决于碰到卡片的左侧还是右侧）；如果按下后
     继续移动超过阈值，则无缝切换成拖拽跟手（见下方 pointermove），
     松手后把拖拽方向/幅度交给同一套弹性回弹——两种交互共用同一套
     物理语言，不冲突。 */
  const TOUCH_ROT_KICK = 19; // 触碰初始偏转（度）
  const TOUCH_LAG_TUG = 10;  // 触碰初始下拽（px）
  const DRAG_THRESHOLD = 4;  // px，超过才算真正开始拖拽
  const badgeDrag = { pressed: false, engaged: false, startX: 0, lastX: 0, lastT: 0, angVel: 0 };
  if (badge && !reducedMotion) {
    badge.style.touchAction = "none";
    badge.style.cursor = "pointer";
    badge.addEventListener("pointerdown", (e) => {
      badgeDrag.pressed = true;
      badgeDrag.engaged = false;
      /* pointer capture 偶发失败（如合成事件/部分输入设备）不该拖垮
         下面的触碰反应，捕获失败就当没发生，其余逻辑照常执行 */
      try { badge.setPointerCapture(e.pointerId); } catch {}
      badgeDrag.startX = badgeDrag.lastX = e.clientX;
      badgeDrag.lastT = performance.now();
      badgeDrag.angVel = 0;

      /* 触碰反应：碰到卡片左侧 → 向右甩，碰到右侧 → 向左甩 */
      const rect = badge.getBoundingClientRect();
      const offset = clamp((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1);
      reboundBadge(-offset * TOUCH_ROT_KICK, TOUCH_LAG_TUG);
    });
    badge.addEventListener("pointermove", (e) => {
      if (!badgeDrag.pressed) return;
      if (!badgeDrag.engaged) {
        if (Math.abs(e.clientX - badgeDrag.startX) < DRAG_THRESHOLD) return; // 未过阈值，当作点击，忽略
        badgeDrag.engaged = true;
        badge.style.cursor = "grabbing";
        if (badgeReboundTL) { badgeReboundTL.kill(); badgeReboundTL = null; } // 拖拽接管，取消触碰回弹
        badgeDrag.lastX = e.clientX; // 从这里开始累计位移，跳过阈值本身那一小段
        badgeDrag.lastT = performance.now();
      }
      const now = performance.now();
      const dtms = Math.max(now - badgeDrag.lastT, 1);
      const dx = e.clientX - badgeDrag.lastX;
      const dAngle = dx * 0.16;
      badgeRot = clamp(badgeRot + dAngle, -26, 26);
      badgeDrag.angVel = (dAngle / dtms) * 1000; // deg/s，用于松手时续力
      badgeDrag.lastX = e.clientX;
      badgeDrag.lastT = now;
    });
    const releaseDrag = () => {
      if (!badgeDrag.pressed) return;
      badgeDrag.pressed = false;
      badge.style.cursor = "pointer";
      if (badgeDrag.engaged) {
        /* 松手把拖拽的力道（角速度）换算成额外甩出的角度，交给
           弹性回弹——越用力甩，松手后弹回前甩得越远 */
        const extra = clamp(badgeDrag.angVel * 0.12, -30, 30);
        reboundBadge(extra, 0);
      }
      badgeDrag.engaged = false;
    };
    badge.addEventListener("pointerup", releaseDrag);
    badge.addEventListener("pointercancel", releaseDrag);
  }

  /* ── ScrollTrigger：接管"滚动 → 平滑进度 pS"这条链路 ──
     scrub 时间常数 ≈ 0.17s，对应原来 pS 指数平滑的 τ=1/6s。

     注意：ScrollTrigger 的 self.progress 天然限制在 [0,1]，而
     pS 原本是不设上限的（scrollY/heroHeight 可以到 1.05+，
     好几处公式——工牌 settle、贴纸淡出——都要用到超过 1 的值才能
     完全饱和）。如果直接把 trigger 范围设成 1×Hero 高，超出部分
     会被截断在 1.0，导致这些公式永远差一点到不了完全饱和状态；
     如果为了让它能到 1.05+ 而把 end 拉长，又会把整个过渡的节奏
     按比例拉慢（同样的滚动距离，进度变少了）。
     解法：让 ScrollTrigger 跟踪"整个文档"的滚动范围（scrub 平滑
     只作用在这个大范围上，不影响节奏），再按 heroHeight 换算回
     原来的单位——pS 的每像素节奏和取值范围都和迁移前完全一致，
     真正被 GSAP 接管的只是"平滑"这一步。 */
  let pS = 0;        // 平滑滚动进度（由 ScrollTrigger 更新）
  let vel = 0;       // 平滑滚动速度（px/帧，手动跟踪，供连续物理使用）
  let lastY = scrollY;
  let wobble = 0;    // 娃娃机摆角
  let dimBase = null;

  if (hasGSAP) {
    ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.17,
      onUpdate: (self) => {
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        pS = (self.progress * maxScroll) / hero.offsetHeight;
      },
    });
  }

  let last = performance.now();

  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; lastY = scrollY; return; }
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = now / 1000;

    if (!hasGSAP) {
      /* 没有 GSAP 时的兜底：退回手写指数平滑，保证页面仍可用 */
      const p = scrollY / hero.offsetHeight;
      pS += (p - pS) * (1 - Math.exp(-dt * 6));
    }
    const raw = scrollY - lastY;
    lastY = scrollY;
    vel += (raw - vel) * (1 - Math.exp(-dt * 8));

    if (!reducedMotion) {
      /* 标题与左右文字：永不参与变暗/网点，只随页面正常滚动 */

      /* ── 统一 Dissolve 场：整个场景（背景/机器/贴纸）被
         同一片网点场溶解——同一网格、同一半径、同一进度 ── */
      const T = win(pS, 0.12, 0.82);
      /* 网点半径区间直接复用 Outro 那套（js/outro.js 里的
         HALFTONE_DISSOLVE，全站唯一定义；outro.js 在本文件之后加载，
         所以在帧循环里读、并留同值兜底）。之前 Hero 自己用 5.2→2.6：
         下限 2.6px 时圆点直径 5.2px、网格才 7px，点与点几乎连成一片，
         永远到不了 Outro 那种清晰稀疏点阵——这就是"Hero 的溶解看不出
         halftone"的根源。统一成 5.6→1.1 后，两个过渡是同一种材质语言，
         About 尾声的终值也正好等于 Outro 的起始值，交接不再跳变。
         节奏窗口 T、各层透明度渐隐、娃娃机/贴纸动画均保持原样 */
      const HD = window.HALFTONE_DISSOLVE || { MIN_DOT: 1.1, MAX_DOT: 5.6 };
      const rStr = (HD.MAX_DOT - (HD.MAX_DOT - HD.MIN_DOT) * T).toFixed(2) + "px";
      const field = (el, r) => {
        if (!el) return;
        if (T <= 0) {
          el.classList.remove("dissolving");
          el.style.removeProperty("--dotR");
          el.style.removeProperty("--bgR");
          el.style.removeProperty("opacity");
        } else {
          el.classList.add("dissolving");
          el.style.setProperty("--dotR", r || rStr);
          el.style.setProperty("--bgR", r || rStr);
        }
      };
      /* 遮罩挂在 machineRig（内容真正的包围盒）而不是外层 wrapper，
         否则超出 wrapper 100vh 盒子的机器上下出血部分会被遮罩裁掉 */
      field(machineRig);
      /* 环境光层的网点和光强错峰——这是 Outro 的既有时序（它的
         lightT 窗口 0.05~0.55、dotT 窗口 0~0.38：点阵稀疏阶段光很暗，
         光亮起来时点已接近实心），所以在 Outro 里永远看不到「亮光 +
         稀疏点」同框。Hero 反向也要守同一条规则：光还亮时网点贴着
         实心（遮罩不可见），master 压暗的后半程网点才逐渐散开，
         终值仍是 MIN_DOT，和 About 尾声 → Outro 的交接值不变。
         不这样错峰的话，中段会出现一大片亮着的点阵背景，抢主体，
         和 Outro 的画面完全不是一回事。
         .layer-ambient 在 Outro 重新点亮环境光时会被那边接管——
         同一个"谁持有谁写"的约定（见 master 那段的 _outroRelit） */
      if (!(window.HERO_BG && window.HERO_BG._outroRelit)) {
        const ambT = win(T, 0.5, 1);
        const ambR = (HD.MAX_DOT - (HD.MAX_DOT - HD.MIN_DOT) * ambT).toFixed(2) + "px";
        field(ambient, ambR);
      }
      field(floatBack);
      field(floatFront);

      /* 各层在同一网点场下的收尾差异。
         opacity progression 对齐 Outro：Outro 的材质在整个网点阶段
         opacity 恒为 1（溶解纯靠遮罩，点始终饱满脆亮，没有渐隐叠加）。
         之前机器从 T=0.35、贴纸从 T=0.2 就开始渐隐，等网点终于散成
         清晰点阵时元素已经半透明——点全是发灰的"鬼影"，这就是和
         Outro 肉眼不一样的第二个根源。现在网点收缩的主阶段保持全
         不透明，只在 dotR 已接近 MIN_DOT 的最后一小段快速淡出清场
         （Hero 的元素必须退场，不能像 Outro 贴纸那样常驻，否则稀疏
         残点会一直飘在后面的 Work 内容上） */
      if (machineRig) {
        machineRig.style.opacity = T > 0 ? (1 - smooth(clamp01((T - 0.72) / 0.28))).toFixed(3) : "";
        /* 只有原地缩放 + 微摆，无任何位移（随 Hero 正常滚动） */
        wobble += (clamp(-vel * 0.02, -1.4, 1.4) - wobble) * (1 - Math.exp(-dt * 3));
        if (pS < 0.004 && Math.abs(wobble) < 0.02) {
          machineRig.style.removeProperty("transform");
        } else {
          const scale = 1 - 0.12 * T;
          machineRig.style.transform =
            `translateX(-50%) scale(${scale.toFixed(4)}) rotate(${wobble.toFixed(3)}deg)`;
        }
      }
      const bg = window.HERO_BG;
      if (bg) {
        if (dimBase === null) dimBase = bg.master;
        /* pS 是整个文档的滚动进度（不只是 About 自己的区间），这个
           loop 从页面加载起就一直在跑，不受 About 是否还在视口内
           限制——滚过 About 以后 T 会一直钉在 1，每一帧都会把
           master 强制写回 0。_pulseBase 未定义时正常按这套压暗逻辑
           写；_outroRelit 是 js/outro.js 滚到结尾时借用同一套"谁在
           持有 master 谁写"的约定拿走的写入权（回到 Hero 氛围、重新
           点亮环境光），这里也要让路，否则每一帧都会被这里写回 0，
           盖掉 Outro 那边刚写的值 */
        if (bg._pulseBase === undefined && !bg._outroRelit) bg.master = dimBase * (1 - T);
      }
      /* 贴纸仍比机器早一步收场（T≈0.95 归零），不会压满 About；
         但网点阶段同样保持全不透明（对齐 Outro，理由见上） */
      for (const fl of [floatBack, floatFront]) {
        if (fl) fl.style.opacity = T > 0 ? (1 - smooth(clamp01((T - 0.6) / 0.35))).toFixed(3) : "";
      }
      const rate = +(1 - 0.85 * T).toFixed(2);
      if (rate !== floatRate) {
        floatRate = rate;
        setFloatRate(floatBack, rate);
        setFloatRate(floatFront, rate);
      }
    }

    /* 工牌：回弹 tween 播放中就交给 GSAP（onUpdate 里已经在写
       badgeRot/badgeLag 了），否则由弹簧追随随滚动速度变化的
       待机摆动目标。旋转的归属会切换（弹簧 / 拖拽指针 / 回弹
       tween 三选一），但垂直迟滞与呼吸和原版一样每帧照常运行、
       最终写入也每帧无条件执行一次——与迁移前完全一致。 */
    if (badge && !reducedMotion) {
      const breath = Math.sin((6.2832 * t) / 7.4) * 1.2;
      const rebounding = badgeReboundTL && badgeReboundTL.isActive();
      const settle = 1 - smooth(clamp01(pS / 1.05));
      const swingCap = 1.8 + 5.2 * settle;  // pS=0: ~7° → 深入 About: 1.8°
      const lagCap = 3.0 + 11.0 * settle;   // pS=0: ~14px → 深入 About: 3px
      const idleRot = Math.sin((6.2832 * t) / 6.8) * 0.45;

      if (!badgeDrag.engaged && !rebounding) {
        const swingTarget = clamp(-vel * 0.11, -swingCap, swingCap);
        [badgeRot, badgeRotVel] = springStep(badgeRot, badgeRotVel, swingTarget + idleRot, 81, 6.3, dt);
      } else {
        badgeRotVel = 0; // 旋转由拖拽指针或回弹 tween 接管
      }

      if (!rebounding) {
        const lagTarget = clamp(-vel * 0.55, -lagCap, lagCap);
        [badgeLag, badgeLagVel] = springStep(badgeLag, badgeLagVel, lagTarget, 49, 9.1, dt);
      }

      applyBadgeTransform(breath);
    }
  }
  requestAnimationFrame(loop);
})();
