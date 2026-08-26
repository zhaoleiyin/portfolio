/* ────────────────────────────────────────────────────────────
   结尾预览缩略图里的摇杆摆动。

   只负责这一件事：让 .ending-joystick-stick 在预览框内缓慢地
   left → center → right → center → 循环。底座不动、卡片不动、
   外层那段 small → grow → final position 的进场动画完全不碰。

   做法：目标角度用一条很慢的正弦波给出，实际角度用弹簧去追这个
   目标——惯性和到位后的轻微回弹都是弹簧本身的物理产物，不是手写的
   关键帧，所以看起来像真的在被人推动，而不是在播一段循环动画。
   阻尼调得偏高，只留一点点回弹，避免变成游戏 UI 那种夸张摆动。

   卡片没进入视口时不跑（IntersectionObserver），标签页隐藏时也不跑，
   不为一个装饰动画一直占着主线程。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const stick = document.querySelector(".ending-joystick-stick");
  if (!stick) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const MAX_DEG = 11;      // 最大倾角：克制，不夸张
  const PERIOD = 7.2;      // 一个完整 左→中→右→中 循环的秒数，刻意慢
  const STIFFNESS = 26;    // 弹簧刚度：越小越"沉"
  const DAMPING = 7.4;     // 阻尼：调高，只留一点点回弹

  let angle = 0;   // 当前角度
  let vel = 0;     // 角速度
  let last = performance.now();
  let running = false;
  let rafId = 0;

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    const dt = Math.min((now - last) / 1000, 0.05); // 夹住，切回标签页不会跳一大步
    last = now;

    // 目标角度：一条很慢的正弦波，天然就是 左→中→右→中 的循环
    const target = Math.sin((now / 1000) * ((2 * Math.PI) / PERIOD)) * MAX_DEG;

    // 弹簧追随：惯性 + 轻微回弹都来自这里
    const accel = (target - angle) * STIFFNESS - vel * DAMPING;
    vel += accel * dt;
    angle += vel * dt;

    stick.style.transform = "rotate(" + angle.toFixed(3) + "deg)";
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // 只在这张卡片真的在视口里时才跑
  const card = stick.closest(".case-ending-preview-image") || stick;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? start : stop)();
      },
      { threshold: 0 }
    ).observe(card);
  } else {
    start();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (card.getBoundingClientRect().top < innerHeight) start();
  });
})();
