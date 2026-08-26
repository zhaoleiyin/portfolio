/* ────────────────────────────────────────────────────────────
   Rise Streak case 页专属交互，不进通用的 js/case.js。

     1) The Problem 构图的分层揭示——整块在 case.js 里被标了
        .case-module-no-reveal（跳过通用的整块 fade），改成按
        阅读顺序 Problem → People → Data → Findings → Insight
        逐组进场，让画面是"长出来"的，不是整块一起亮。
     2) 连接人物与数字的细橙线描边生长（在人物之后才画）。
     3) 两个真实数字 0 → 5 / 0 → 38 的滚动计数。
     4) 人物圆片和数字的极轻微浮动（几个像素、各自错开相位）。
     5) Companion 视频的声音开关（不依赖 GSAP）。

   prefers-reduced-motion 或没有 GSAP 时：动画全部不跑，数字直接
   显示最终值；切换按钮和声音开关照常工作。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const root = document.getElementById("rsp");
  const nums = root
    ? Array.from(root.querySelectorAll(".rsp-stat-num"))
    : [];
  const finalOf = (el) => parseInt(el.dataset.count, 10) || 0;

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Companion 视频的声音开关 ──
     默认静音（喇叭显示关闭态），只有用户点击才出声；再点回到
     静音。不自动播声。 */
  const sndBtn = document.getElementById("rs-companion-sound");
  const sndVid = document.getElementById("rs-companion-video");
  if (sndBtn && sndVid) {
    sndBtn.addEventListener("click", () => {
      if (sndVid.muted) {
        sndVid.muted = false;
        sndVid.currentTime = 0;
        sndVid.play();
        sndBtn.classList.add("is-on");
        sndBtn.setAttribute("aria-label", "Mute sound");
        sndBtn.setAttribute("title", "Mute sound");
      } else {
        sndVid.muted = true;
        sndBtn.classList.remove("is-on");
        sndBtn.setAttribute("aria-label", "Play with sound");
        sndBtn.setAttribute("title", "Play with sound");
      }
    });
  }

  // 降级路径：数字直接落到最终值，动画都不跑
  if (!hasGSAP || reducedMotion) {
    nums.forEach((el) => (el.textContent = String(finalOf(el))));
    return;
  }
  if (!root) return;

  // 和 case.js 同一个约定：从 Work 页 morph 进来的那一秒里不建
  // ScrollTrigger（每建一个都要读一次布局，会卡在进场动画的头几帧上）
  function whenReady(fn) {
    if (document.documentElement.dataset.caseEnter === "1") {
      window.addEventListener("case:entered", fn, { once: true });
    } else {
      fn();
    }
  }

  /* ── 1) 分层揭示 ──
     按阅读顺序分组，每组一个 ScrollTrigger。人物圆片和 findings
     内部再各自 stagger，一个一个落位 */
  const groups = [
    { els: [root.querySelector(".rsp-kicker")], stagger: 0 },
    { els: Array.from(root.querySelectorAll(".rsp-face")), stagger: 0.08 },
    { els: Array.from(root.querySelectorAll(".rsp-stat")), stagger: 0.12 },
    { els: Array.from(root.querySelectorAll(".rsp-note")), stagger: 0.1 },
  ];

  // 连接人物和数字的细线：描边生长，跟在人物圆片后面出现——先有人，
  // 线才把他们连起来，顺序反过来会像先画网格再填内容
  const stage = root.querySelector(".rsp-stage");
  const wires = Array.from(root.querySelectorAll(".rsp-web-g path"));

  const revealed = new WeakSet();

  whenReady(() => {
    wires.forEach((path, i) => {
      const len = path.getTotalLength();
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 0.9,
        ease: "power2.out",
        delay: 0.5 + i * 0.09,
        scrollTrigger: { trigger: stage, start: "top 78%" },
      });
    });

    groups.forEach((g) => {
      const els = g.els.filter(Boolean);
      if (!els.length) return;
      gsap.set(els, { opacity: 0, y: 20 });
      gsap.to(els, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: "power2.out",
        stagger: g.stagger,
        scrollTrigger: { trigger: els[0], start: "top 88%" },
        onComplete: () => els.forEach((el) => float(el)),
      });
    });

    /* ── Final Experience：三条 flow 的文字进场 ──
       每一行的文字块单独一个 ScrollTrigger：eyebrow → 标题 → 每一条
       步骤依次揭示。视频本身不做进场动画（它在自动播放，再叠一层
       位移会显得晃） */
    document.querySelectorAll(".rs-fx-row").forEach((row) => {
      const copy = row.querySelector(".rs-fx-copy");
      if (!copy) return;
      const bits = copy.querySelectorAll(
        ".rs-fx-eyebrow, .rs-fx-title, .rs-fx-step"
      );
      if (!bits.length) return;
      gsap.set(bits, { opacity: 0, y: 24 });
      gsap.to(bits, {
        opacity: 1,
        y: 0,
        duration: 0.72,
        ease: "power2.out",
        stagger: 0.09,
        scrollTrigger: { trigger: row, start: "top 74%" },
      });
    });

    /* ── 2) 数字 0 → N ──
       每个数字自己的 ScrollTrigger，进入视口才开始数 */
    nums.forEach((el) => {
      const target = finalOf(el);
      const counter = { v: 0 };
      gsap.to(counter, {
        v: target,
        duration: 1.4,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 86%" },
        onUpdate: () => (el.textContent = String(Math.round(counter.v))),
        onComplete: () => (el.textContent = String(target)),
      });
    });
  });

  /* ── 3) 极轻微浮动 ──
     只给人物圆片和数字。振幅 4–8px、周期 4–7s、相位靠元素自己的
     --d 错开，任何两个都不同步。揭示动画结束后才挂（onComplete），
     否则 y 会被两条时间轴同时写，进场落点会飘 */
  function float(el) {
    if (revealed.has(el)) return;
    revealed.add(el);
    const isFace = el.classList.contains("rsp-face");
    if (!isFace && !el.classList.contains("rsp-stat")) return;

    const d = parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0;
    const amp = isFace ? 5 + (d % 3) * 1.6 : 4;
    const dur = 4.2 + (d % 4) * 0.7;

    gsap.to(el, {
      y: -amp,
      duration: dur,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
      delay: d * 0.32,
    });
  }
})();
