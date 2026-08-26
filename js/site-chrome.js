/* ────────────────────────────────────────────────────────────
   全局底栏亮度：Hero/About 内保持低亮度（不抢正文），
   接近页面底部（未来的 Work 区块/整站末尾）时连续增强到满亮度。
   顶部导航亮度恒定，不随滚动变化。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const footer = document.getElementById("site-footer");
  if (!footer) return;

  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  const smooth = (v) => v * v * (3 - 2 * v);

  const LOW = 0.36;   // Hero / About 内的基础亮度
  const HIGH = 0.92;  // 接近页面底部时的亮度
  const RAMP_VH = 1.1; // 距底部多少个视口高度内开始增亮

  let ticking = false;
  function update() {
    ticking = false;
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const distToBottom = Math.max(maxScroll - scrollY, 0);
    const near = maxScroll > 0
      ? 1 - clamp01(distToBottom / (innerHeight * RAMP_VH))
      : 1;
    footer.style.opacity = (LOW + (HIGH - LOW) * smooth(near)).toFixed(3);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  update();
})();
