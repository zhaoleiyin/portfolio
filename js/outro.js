/* ────────────────────────────────────────────────────────────
   Outro：Hero→About 那套 Halftone 溶解的反向版本。

   贴纸的运动是 js/hero-float.js 那套下落/摇摆/翻转逻辑的独立
   副本——同样的随机范围、同样的时长、同样的节奏，持续运行，
   不是"滚动到这里才飞入"的一次性入场动画（和 Hero 里的贴纸一样，
   一直在飘，只是材质会随滚动从稀疏点阵变成实体）。没有直接复用
   hero-float.js 本体，是因为它内部会把贴纸 DOM 移到 Hero 自己的
   .hero-float-back/front 图层里（前后景深轮换），如果直接把这批
   贴纸也交给它管，会被搬出 Outro、混进 Hero 的图层。

   节奏（本区块自己的滚动进度 0~1，窗口化写法和 hero-about.js 同一套
   语言：win(p,s,e) = 在 [s,e] 内 smoothstep 从 0 到 1）：
     1) 贴纸材质从稀疏点阵恢复成实体（--dotR 变大），运动全程不停
     2) 一个爪子（截短过的杆，视觉重点在爪子本体）带阻尼摆动地荡出来
     3) 收尾文案淡入
     4) 环境光跟着一起重新亮回 Hero 原始亮度，呼应"滚回 Hero"的闭环

   重要：window.HERO_BG.master 只在这个区块自己的 ScrollTrigger
   onUpdate/onRefresh 回调里、按这个区块自己的 progress 写入，绝不
   在页面刚加载、还没滚到这里时就无条件生效——上一版 Contact 的教训
   就是在这里把全局环境光亮度无条件写成了 0，页面一加载就把 Hero
   本身的光效带崩了。这次严格只用 progress 门控，回到 0 就相当于
   没碰过（About 那套压暗逻辑已经把它压到 0，这里只是同一个值上
   再叠加一段可逆的回升）。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const section = document.getElementById("outro");
  const materials = document.getElementById("outro-materials");
  const materialsFront = document.getElementById("outro-materials-front");
  const claw = document.getElementById("outro-claw");
  const stickers = Array.from(document.querySelectorAll(".outro-sticker"));
  const headline = document.getElementById("outro-headline");
  const resumeChip = document.getElementById("outro-resume");
  const ambient = document.querySelector(".layer-ambient");
  if (!section || !claw) return;

  /* 页面刚加载、还没滚动到 About 触发变暗之前，window.HERO_BG.master
     还是 hero-bg.js 里 CONFIG 定义的原始整体光强（1.25）——这里趁着
     还没被压暗时先记下来，作为 Outro 重新点亮环境光要回到的目标值，
     不要自己硬编码一个数字（万一以后调了 CONFIG.master 这里也不用跟着改） */
  const heroLightBase = window.HERO_BG ? window.HERO_BG.master : 0;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return; // 保留 CSS 默认：贴纸在位、爪子实体、文案可见，不做动画

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const clamp01 = (v) => clamp(v, 0, 1);
  const smooth = (v) => v * v * (3 - 2 * v);
  const win = (p, s, e) => smooth(clamp01((p - s) / (e - s)));

  function springStep(pos, vel, target, k, c, dt) {
    const accel = -k * (pos - target) - c * vel;
    const nv = vel + accel * dt;
    return [pos + nv * dt, nv];
  }

  /* ── 贴纸持续漂浮：和 js/hero-float.js 的 cycle() 同一套数值范围 ── */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function cycleSticker(el) {
    const img = el.querySelector("img");

    const dur = rand(20, 50) * 1000;
    const gentle = Math.random() < 0.5;
    /* 漂移/摇摆幅度比 Hero 原版收窄了不少——Hero 的贴纸层铺满全屏、
       允许贴纸半探出边缘甚至整个飘出画面；Outro 的舞台只有一屏高、
       两侧空间有限，原版的幅度会把贴纸带出 .outro-stage 的裁切框，
       看起来像被硬生生切掉了一块。这里收紧数值范围，保证下落全程
       都完整可见，运动方式、速度、节奏本身不变 */
    const drift = (gentle ? rand(2, 5) : rand(6, 12)) * pick([-1, 1]) * innerWidth / 100;
    const arcExp = rand(0.7, 2.4);
    const sway = rand(5, 12);
    const swayCycles = rand(1.5, 3);
    const phase = rand(0, Math.PI * 2);

    el.style.left = rand(14, 74).toFixed(1) + "%";

    const STEPS = 14;
    const frames = [];
    for (let i = 0; i <= STEPS; i++) {
      const p = i / STEPS;
      const x = drift * Math.pow(p, arcExp) + Math.sin(phase + p * 6.2832 * swayCycles) * sway;
      frames.push({
        offset: p,
        easing: "linear",
        transform: `translate(${x.toFixed(1)}px, ${(p * 155).toFixed(2)}vh)`,
      });
    }
    const fall = el.animate(frames, { duration: dur, easing: "linear" });

    const turns = pick([-2, -1.5, -1, 1, 1.5, 2]);
    img.animate(
      [{ transform: "rotate(0deg)" }, { transform: `rotate(${turns * 360}deg)` }],
      { duration: dur, easing: "linear" }
    );

    fall.onfinish = () => setTimeout(() => cycleSticker(el), rand(800, 9000));
  }

  /* 前后景深：跟 Hero 的 .hero-float-back(压在机器/文字之下) /
     .hero-float-front(压在机器/文字之上) 完全同一套逻辑——每个贴纸
     随机分到其中一层，一次性决定它相对爪子和文案的前后关系，不是
     "只跟爪子比一次、再跟文字比一次"两个独立判断。分到 front 的
     直接把 DOM 节点挪进 .outro-materials-front（在 headline 之后、
     天然盖在文字上面）；留在原地的就还是 .outro-materials 那层
     （在 headline 之前，天然在爪子和文字下面）。挪动 DOM 节点不影响
     后面 cycleSticker 用 el.animate() 写的漂浮动画，动画跟着元素走 */
  let t0 = 500;
  for (const el of stickers) {
    if (materialsFront && Math.random() < 0.5) materialsFront.appendChild(el);
    el.style.visibility = "hidden";
    setTimeout(() => {
      el.style.visibility = "visible";
      cycleSticker(el);
    }, t0);
    t0 += rand(1400, 2600);
  }

  /* ── 滚动驱动：贴纸/爪子的点阵→实体材质，爪子出现节点，文案淡入 ── */
  /* Halftone 溶解的网点半径区间——这里是全站的唯一定义（Outro 是这套
     视觉语言的标准）。Hero→About 的过渡（js/hero-about.js）每帧读同
     一份，保证两处的 dot pattern / density / 溶解行为完全一致，也让
     About 尾声的终值和 Outro 起始值天然相等，交接处不再跳变 */
  window.HALFTONE_DISSOLVE = { MIN_DOT: 1.1, MAX_DOT: 5.6 };
  const MIN_DOT = window.HALFTONE_DISSOLVE.MIN_DOT;
  const MAX_DOT = window.HALFTONE_DISSOLVE.MAX_DOT;
  let clawT = 0;

  function applyProgress(p, engaged) {
    engagedForMouse = engaged;
    // 从 0 就开始揭示（配合 .outro 的负 margin-top），让贴纸的实体化
    // 和 Work 最后一个 case 的淡出在时间上重叠，不留一段纯黑空白
    const dotT = win(p, 0.0, 0.38);
    clawT = win(p, 0.30, 0.48);
    const headT = win(p, 0.46, 0.68);

    const dotR = (MIN_DOT + (MAX_DOT - MIN_DOT) * dotT).toFixed(2) + "px";
    if (materials) materials.style.setProperty("--dotR", dotR);
    if (materialsFront) materialsFront.style.setProperty("--dotR", dotR);
    claw.style.opacity = clamp01(clawT * 1.4).toFixed(3);
    /* resume.pdf 和爪子同节奏淡入。写在 --reveal 上而不是 opacity 上，
       是为了不覆盖 CSS 里 0.85 常态 / hover 全亮那组透明度 */
    if (resumeChip) {
      resumeChip.style.setProperty("--reveal", clamp01(clawT * 1.4).toFixed(3));
      resumeChip.style.pointerEvents = clawT > 0.5 ? "auto" : "none";
    }

    /* .layer-ambient（Hero 环境光画布）从 About 结束时就一直停在一个
       半溶解状态（hero-about.js 里那套 dissolving/--bgR，一直没被
       清掉，只是之前 master 一直是 0 看不出来）——现在环境光要在这里
       重新点亮，得连它自己的材质也一起从"停在 About 尾声的小 dotR"
       变回完整实体，跟贴纸/爪子同一个节奏，否则点亮的是一张带网点的
       环境光而不是 Hero 原本那种连续柔光。dotT 到头（真正完全实体）
       就直接把遮罩摘掉，精确复原 Hero 静止时的样子，不是无限接近 */
    if (engaged && ambient) {
      if (dotT >= 0.999) {
        ambient.classList.remove("dissolving");
        ambient.style.removeProperty("--bgR");
      } else {
        ambient.classList.add("dissolving");
        ambient.style.setProperty("--bgR", dotR);
      }
    }

    if (headline) {
      headline.style.opacity = headT.toFixed(3);
      headline.style.transform = `translate(-50%, -50%) translateY(${(6 * (1 - headT)).toFixed(1)}px)`;
    }

    /* 环境光跟贴纸/爪子的"从点阵恢复成实体"同步重新亮起来，回到
       Hero 那个原始亮度——形成"滚回 Hero 氛围"的闭环。

       只有 engaged（真的滚动进入过这个区块）时才写 master——
       ScrollTrigger 在页面刚加载时会给所有已注册的 trigger 都触发
       一次 onRefresh，此时 Outro 还在视口下方很远、progress 恰好
       是 0，如果不做这个区分，会把"progress=0"误判成"还没重新
       点亮"，从而在用户还没滚到这里之前就把 master 写成 0，抢先
       覆盖掉 Hero 本来的原始亮度——这正是上一版 Contact 的教训
       （不受实际滚动状态控制、无条件写 master，页面一加载就把
       Hero 自己的光效写没了）。engaged=false 时完全不碰 master，
       让它保持 hero-about.js 那套压暗逻辑算出来的值。

       光是 engaged 判断还不够：hero-about.js 里有一个从页面加载起
       就持续运行、不受自己是否还在视口内限制的 rAF loop，一旦滚动
       深度过了 About 就会每一帧都把 master 强制写回 0——如果这里
       只是"偶尔写一次"，下一帧立刻就被那个 loop 盖掉。这里借用
       它已有的"谁在持有 master 谁写"的约定（原本是给 hero-machine.js
       的爪子 pulse 特效用的 _pulseBase）：engaged 时设一个新的
       _outroRelit 标记声明"这段时间由 Outro 持有"，hero-about.js
       那边的写入会让路（见 hero-about.js 对应注释）；离开这个区块时
       清掉标记，把 master 的所有权交还给 hero-about 那套逻辑 */
    const bg = window.HERO_BG;
    if (bg) {
      bg._outroRelit = engaged;
      if (engaged && bg._pulseBase === undefined) {
        const lightT = win(p, 0.05, 0.55);
        bg.master = heroLightBase * lightT;
      }
    }
  }

  /* ── 环境光跟鼠标联动，和 Hero 用同一份状态 ──
     hero-bg.js 自己的 pointermove 监听是按 Hero 那个 <section> 的
     getBoundingClientRect() 来判断"鼠标在不在光源感应范围内"的——
     一旦滚到 Outro，Hero 早就滚到视口外、rect 是一堆不合理的负数，
     每次 e.clientY 都必然落在 rect 范围之外，直接被那个判断挡在门外，
     鼠标移动永远不会更新光源位置，这就是 Outro 环境光不跟手的原因。
     不改 hero-bg.js 那段（它对 Hero 自己仍然是对的），而是复用它已经
     暴露出来的同一个 mouse 状态对象（CONFIG._mouse，见 hero-bg.js），
     在 Outro 自己 engaged 的时候接管一样的 tx/ty/ta 写入——环境光画布
     整个是 fixed 铺满视口的，不需要像 Hero 那样换算某个 section 的
     rect，直接用整个视口归一化坐标即可 */
  let engagedForMouse = false;
  const heroMouse = window.HERO_BG ? window.HERO_BG._mouse : null;
  if (heroMouse && matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", (e) => {
      if (!engagedForMouse) return;
      heroMouse.tx = e.clientX / innerWidth - 0.5;
      heroMouse.ty = 0.5 - e.clientY / innerHeight;
      heroMouse.ta = 1;
    });
    const releaseMouse = () => {
      if (!engagedForMouse) return;
      heroMouse.tx = 0;
      heroMouse.ty = 0;
      heroMouse.ta = 0;
    };
    document.addEventListener("pointerleave", releaseMouse);
    window.addEventListener("blur", releaseMouse);
  }

  if (hasGSAP) {
    /* top top / bottom bottom：progress=0 是 .outro-stage 吸顶锁定的
       那一刻，progress=1 是这个区块滚动预算用完的那一刻 */
    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      /* engaged 不能只看 self.isActive——滚到区间正好用完的那一刻
         （progress 精确等于 1）isActive 会变回 false，如果只用它当
         开关，用户停在结尾（headline 停留的位置）时环境光会突然
         被 hero-about.js 那套压暗逻辑抢回去、啪地灭掉。progress>0
         本身就足够说明"确实滚动经过了这里"，用它兜底，只有真正
         "从没进来过"（progress===0 且 isActive===false，比如页面刚
         加载、Outro 还在视口下方很远的那次 onRefresh）才判定未 engaged */
      onUpdate: (self) => applyProgress(self.progress, self.isActive || self.progress > 0),
      onRefresh: (self) => applyProgress(self.progress, self.isActive || self.progress > 0),
    });
  } else {
    function updateFallback() {
      const r = section.getBoundingClientRect();
      const total = r.height - innerHeight;
      applyProgress(total > 0 ? clamp01(-r.top / total) : 0, r.top <= 0);
    }
    addEventListener("scroll", updateFallback, { passive: true });
    addEventListener("resize", updateFallback);
    updateFallback();
  }

  /* ── resume.pdf 的夹取下载 ──
     点击 → 爪子垂直降到文字上 → 合爪夹住 → 带着文字提回原位 →
     触发下载 → 停一拍 → 送回原位、张爪、空爪升回。
     和摆动共用同一条 transform 管道：这里只写 grabOffset（垂直位移）
     和两条臂/文字自己的 transform，爪子容器的 transform 始终由下面的
     rAF 循环统一拼（translateY + 弹簧 rotate），两套动画不会互相覆盖。
     夹取期间弹簧的呼吸摆动目标压到接近 0，爪子"专注干活"不乱晃 */
  let grabOffset = 0;
  let grabbing = false;

  if (resumeChip && hasGSAP) {
    const armL = claw.querySelector(".oc-l");
    const armR = claw.querySelector(".oc-r");
    const o = { y: 0, arm: 0 };
    let held = false;
    let dropDist = 0;

    const render = () => {
      grabOffset = o.y;
      const chipY = held ? o.y - dropDist : 0;
      resumeChip.style.transform =
        "translateX(-50%) translateY(" + chipY.toFixed(1) + "px)";
      if (armL) armL.style.transform = "rotate(" + (o.arm * 13).toFixed(2) + "deg)";
      if (armR) armR.style.transform = "rotate(" + (-o.arm * 13).toFixed(2) + "deg)";
    };

    const startDownload = () => {
      const a = document.createElement("a");
      a.href = resumeChip.getAttribute("href");
      a.download = "resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    resumeChip.addEventListener("click", (e) => {
      e.preventDefault();
      if (grabbing) return;
      grabbing = true;
      /* 每次点击现量：视口尺寸、滚动位置都会影响两者的相对距离。
         目标是爪尖（容器底边）落到文字的垂直中心再往下压一点，
         让两条臂正好夹在文字两侧 */
      const clawR = claw.getBoundingClientRect();
      const chipR = resumeChip.getBoundingClientRect();
      dropDist = chipR.top + chipR.height / 2 - clawR.bottom + 6;

      gsap
        .timeline({
          onUpdate: render,
          onComplete: () => {
            grabbing = false;
            render();
          },
        })
        .to(o, { y: dropDist, duration: 0.55, ease: "power2.inOut" })
        /* 爪尖触到文字的这一瞬间就触发下载——下载是"碰到"的反馈，
           不等提起动作走完 */
        .call(startDownload)
        .to(o, { arm: 1, duration: 0.2, ease: "power3.out" })
        .call(() => (held = true))
        .to(o, { y: 0, duration: 0.6, ease: "power2.inOut" }, "+=0.08")
        .to(o, { y: dropDist, duration: 0.55, ease: "power2.inOut" }, "+=0.4")
        .to(o, { arm: 0, duration: 0.22, ease: "power2.out" })
        .call(() => (held = false))
        .to(o, { y: 0, duration: 0.5, ease: "power2.inOut" });
    });
  } else if (resumeChip) {
    // 没有 GSAP：不拦截点击，让 <a download> 自己下载
  }

  /* ── 爪子的摆动：持续弹簧物理，不是一次性 tween ──
     目标角度默认是很轻的呼吸摆动（不完全静止）；一旦 clawT 从"未出现"
     跨过"開始出现"的门槛，就甩一下角度，交给弹簧欠阻尼地荡回来，
     像真的挂在一小截杆下面被带出来一样。scroll 往回滚、clawT 掉回 0
     后允许下次再跨过门槛时重新甩一下。 */
  let rot = 0, rotVel = 0;
  let hasKicked = false;
  const KICK_ANGLE = 15;

  let lastT = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    const t = now / 1000;

    if (clawT > 0.08 && !hasKicked) {
      hasKicked = true;
      rot = KICK_ANGLE;
      rotVel = 0;
    } else if (clawT < 0.02 && hasKicked) {
      hasKicked = false;
    }

    // 落定后也有一点点呼吸摆动，不完全静止；夹取期间压到接近 0
    const idleTarget = Math.sin((6.2832 * t) / 4.6) * (grabbing ? 0.15 : 1.3);
    [rot, rotVel] = springStep(rot, rotVel, idleTarget, 46, 5.6, dt);

    claw.style.transform = `translate(-50%, -50%) translateY(${grabOffset.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
  }
  requestAnimationFrame(loop);
})();
