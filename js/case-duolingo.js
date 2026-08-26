/* ────────────────────────────────────────────────────────────
   只服务 Duolingo 这一个 case 的交互，不进通用 js/case.js：
   Experience section 的 sticky video + 01–05 字幕滚动联动。

   桌面端：视频是唯一常驻的视觉主体，pin 在原位，不自动播放——
   scroll progress 直接映射到 video.currentTime（GSAP ScrollTrigger
   + scrub:true，不带缓动数值，保证停止滚动时播放头立即停在当前
   进度对应的那一帧，不会有滞后的"追赶"动画）。五条字幕一次只显示
   一条，在视频左右两侧交替出现（DOM 上拆成左/右两个容器，用
   data-index 而不是数组下标匹配当前该点亮哪一条），用同一个
   ScrollTrigger 的 progress 计算，和视频共享同一个时间轴，天然同步。
   移动端不做 pin/左右交替，改成每条步骤随滚动单独 fade+y 进场，
   和站内其它模块的克制揭示手法一致；视频在这个断点下没有对应的
   pin 时长可以映射，保持在第一帧暂停，不额外发明一套移动端 scrub。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const scroller = document.getElementById("experience-scroller");
  if (!scroller) return;

  const sticky = scroller.querySelector(".case-experience-sticky");
  const steps = Array.from(scroller.querySelectorAll(".case-experience-step"));
  const video = scroller.querySelector(".case-experience-video video");
  if (!sticky || !steps.length || !video) return;

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isDesktop = () => window.innerWidth >= 900;

  // 明确不自动播放：视频只在桌面端由滚动进度驱动 currentTime，
  // 移动端就停在第一帧
  video.pause();
  try {
    video.currentTime = 0;
  } catch (e) {
    // 部分浏览器在 metadata 就绪前设置 currentTime 会抛错，
    // 忽略即可——下面 loadedmetadata 之后的首次 scrub 会补上
  }

  if (!hasGSAP) {
    // 没有 GSAP 的降级：直接把六步都显示成"当前"状态，保证内容
    // 始终可读；没有 ScrollTrigger 就没有滚动联动，视频停在第一帧
    steps.forEach((el) => el.classList.add("is-active"));
    return;
  }

  // 步骤现在按左右两侧拆成两个 DOM 容器（01/03/05 在左，02/04 在
  // 右），DOM 顺序不再等于步骤序号，用 data-index 显式匹配当前激活
  // 的是哪一条，而不是数组下标
  function setActive(index) {
    steps.forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.index) === index);
    });
  }

  function scrubTo(progress) {
    const duration = video.duration;
    if (!duration || Number.isNaN(duration)) return;
    video.currentTime = Math.min(duration, Math.max(0, progress * duration));
  }

  let triggers = [];
  function teardown() {
    triggers.forEach((t) => t.kill());
    triggers = [];
    gsap.set(sticky, { clearProps: "opacity,transform" });
    gsap.set(steps, { clearProps: "opacity,transform" });
  }

  function setupDesktop() {
    setActive(0);
    scrubTo(0);
    const distance = Math.max(window.innerHeight * 2.4, 1600);
    triggers.push(
      ScrollTrigger.create({
        trigger: scroller,
        start: "top top+=72",
        end: "+=" + distance,
        pin: sticky,
        scrub: true,
        onUpdate(self) {
          const idx = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
          setActive(idx);
          scrubTo(self.progress);
        },
      })
    );
  }

  function setupMobile() {
    steps.forEach((el) => el.classList.add("is-active"));
    if (reducedMotion) return;
    steps.forEach((el) => {
      const tween = gsap.fromTo(
        el,
        { opacity: 0, y: 22 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        }
      );
      if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
    });
  }

  function setup() {
    teardown();
    if (reducedMotion) {
      steps.forEach((el) => el.classList.add("is-active"));
      return;
    }
    if (isDesktop()) {
      setupDesktop();
    } else {
      setupMobile();
    }
    // 这里的 pin 一建立就往文档里插入约 1920px 的 pin-spacer——首次从
    // Work 页 morph 进来时，视频 metadata 是进场结束后才到的，也就是说
    // pin 比结尾退场的 trigger 晚出生。ScrollTrigger 对「上方 pin 撑高
    // 的距离」的补偿只认创建顺序（refresh 多少次都不会补，实测过），
    // 所以光 refresh 不够——广播一个事件，让结尾脚本把自己的 trigger
    // 拆掉重建，重建后创建顺序排到 pin 之后，补偿才生效。refresh 本身
    // 也要发：sticky 的负 top 和各揭示 trigger 靠它重算
    if (window.ScrollTrigger) ScrollTrigger.refresh();
    window.dispatchEvent(new Event("case:pins-changed"));
  }

  if (video.readyState >= 1) {
    setup();
  } else {
    video.addEventListener("loadedmetadata", setup, { once: true });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 200);
  });
})();

/* ────────────────────────────────────────────────────────────
   Research · Key Findings 横向 media strip：只能靠两侧箭头手动
   切换，不响应鼠标滚轮、trackpad 横向手势、拖拽，也不会被页面本身
   的纵向滚动带动——用户正常上下滚动页面时，这条 strip 必须停在
   原来的位置不变。strip 是 overflow:hidden 的固定视口，真正移动的
   是里面的 .case-findings-track，点箭头才会把它 translateX 平移
   一张卡片的宽度（+gap），没有任何事件监听会绕开这两个按钮去改
   平移量 */
(() => {
  "use strict";

  const strip = document.getElementById("findings-strip");
  const track = document.getElementById("findings-track");
  if (!strip || !track) return;

  const prevBtn = document.getElementById("findings-prev");
  const nextBtn = document.getElementById("findings-next");

  let offset = 0;

  function maxOffset() {
    return Math.max(0, track.scrollWidth - strip.clientWidth);
  }

  function stepWidth() {
    const first = track.querySelector(".case-finding");
    if (!first) return strip.clientWidth;
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap || style.gap || "0") || 0;
    return first.getBoundingClientRect().width + gap;
  }

  function apply() {
    track.style.transform = "translateX(-" + offset + "px)";
    if (prevBtn) prevBtn.classList.toggle("is-visible", offset > 1);
    if (nextBtn) nextBtn.classList.toggle("is-visible", offset < maxOffset() - 1);
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      offset = Math.max(0, offset - stepWidth());
      apply();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      offset = Math.min(maxOffset(), offset + stepWidth());
      apply();
    });
  }

  window.addEventListener("resize", () => {
    offset = Math.min(offset, maxOffset());
    apply();
  });

  apply();
})();

/* ────────────────────────────────────────────────────────────
   Ideation slideshow：01 Brainstorm → 02 User Flow → 03 Early
   Wireframes 三个阶段共享同一块展示区，点底部 01/02/03 直接跳转
   （不再是箭头切换）——横向 slide：track 用 transform:translateX
   整体平移，旧内容推出、新内容从对应方向推入，纯 CSS transition，
   不需要额外动画库。当前页码用 .is-active 高亮（对应 CSS 里的
   opacity:1），其余降 opacity */
(() => {
  "use strict";

  const track = document.getElementById("ideation-track");
  const pager = document.getElementById("ideation-pager");
  if (!track || !pager) return;

  const pagerItems = Array.from(pager.children);
  let index = 0;

  function render() {
    track.style.transform = "translateX(" + -index * 100 + "%)";
    pagerItems.forEach((el, i) => el.classList.toggle("is-active", i === index));
  }

  pagerItems.forEach((el, i) => {
    el.addEventListener("click", () => {
      if (index === i) return;
      index = i;
      render();
    });
  });

  render();
})();
