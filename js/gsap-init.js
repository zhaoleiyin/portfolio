/* ────────────────────────────────────────────────────────────
   GSAP 接入：只做库注册，不驱动任何具体动画。

   现有的 rAF/WAAPI 动画（hero-bg.js 的 WebGL 呼吸光、
   hero-machine.js 的抓夹/摇杆、hero-about.js 的滚动过渡与
   工牌弹簧、hero-float.js 的贴纸飘落、site-chrome.js 的
   底栏亮度）在这一步完全不受影响，继续按原样运行。

   之后如果要把某段动画迁移到 GSAP，就在对应的文件里用
   gsap.to() / gsap.timeline() / ScrollTrigger.create() 改写，
   不需要动这个文件。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";
  if (!window.gsap) {
    console.warn("[gsap-init] gsap 未加载，检查 node_modules/gsap/dist 脚本路径");
    return;
  }
  if (window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  } else {
    console.warn("[gsap-init] ScrollTrigger 未加载");
  }
})();
