/* ────────────────────────────────────────────────────────────
   Work → Case Study 进场过渡的第二段（第一段见 js/work-transition.js）。

   页面 <head> 里那段内联脚本已经在首次绘制之前把 Work 页交接过来的起始
   box 写成 CSS 变量、给 <html> 打上 data-case-enter="1"（对应 css/case.css
   里先把页面结构藏起来的规则），所以这里接手时不会先闪一眼完整版面。

   这一段做的事：
     · 直接对 Case 页 Hero 本尊做 FLIP——先用 transform 把它「摆回」Work
       页那个 box，再动画回 transform:none。终点就是它自己真实的 DOM
       位置，不写死任何 left/top/width/height，resize 后也一样准。
       刻意不再克隆一个 <video>：克隆件会让同一个 hero.mp4 被重新请求、
       重新解码一遍（实测多出一次 100ms 之后才开始的请求），morph 只能
       干等它就绪——这正是「点开先卡一下再放大」的主要来源之一。
       transform 不影响布局，所以 Case Study 的版面一个像素都没动。
     · 两边 Hero 都是 16:9，全程等比缩放，不会变形、不会重新裁切。
     · 图片走完约 80% 之后才揭示页面结构：先左侧 sticky 侧栏轻微
       slide + fade，再依次项目名 / tagline / 年份·类别 / 目录，最后其余
       内容淡入。顺序是 IMAGE EXPANDS → PAGE STRUCTURE REVEALS。
     · 进场这一秒里，把首屏之外的重资源（Campaign 那两张 4.4MB / 2.4MB
       的大图、3MB 的视频等）全部推迟，避免它们的解码占住主线程，
       让 morph 掉帧。过渡结束后再放行。

   动画结束后所有临时状态全部清掉，Case Study 自己的 layout / sticky
   侧栏 / 间距 / 滚动交互一个都没改。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const root = document.documentElement;
  const hero = document.getElementById("case-hero-media");

  /* 所有 case 共用这一份脚本，slug 由文件名推导（work/duolingo.html →
     "duolingo"），不写死在代码里。它只用来给 Hero box 的缓存分键，
     让每个 case 各记各的终点 */
  const SLUG = (location.pathname.split("/").pop() || "").replace(/\.html?$/i, "");

  // 把 Hero 在正常文档流里的真实 box 实测下来存好（连同当时的视口尺寸）。
  // Work 页点击时就是靠它当终点，才能在首页当帧就朝正确方向平移+放大，
  // 而不是等进了这个页面才开始动。这里存的是实测值，不是写死的坐标；
  // 每次访问本页都会刷新一次，所以 layout 改了它也跟着变。
  // 放在最前面、且不受进场判断影响——直接打开本页也要把它存下来
  function cacheHeroBox() {
    if (!hero) return;
    try {
      // 用 offset 链而不是 getBoundingClientRect：js/case.js 的模块揭示
      // 动画会给 .case-module（Hero 也是其中之一）挂上 y:22 的 transform，
      // rect 会把这个位移算进去，量出来的位置比真实布局位置低一截。
      // offsetLeft/offsetTop 是纯布局值，不受 transform 影响
      let x = 0, y = 0, el = hero;
      while (el) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
      const w = hero.offsetWidth, h = hero.offsetHeight;
      if (!w || !h) return;
      localStorage.setItem(
        "case-hero-box:" + SLUG,
        JSON.stringify({
          x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
          vw: window.innerWidth, vh: window.innerHeight,
        })
      );
    } catch (e) {
      /* localStorage 不可用就算了，Work 页会退化成保守位移 */
    }
  }

  if (root.dataset.caseEnter !== "1") {
    // 没有进场动画（直接打开/刷新）：只负责把 box 量好存下来
    if (document.readyState === "complete") cacheHeroBox();
    else window.addEventListener("load", cacheHeroBox, { once: true });
    return;
  }

  // 首屏之外的重资源：进场期间先按住不放，过渡结束再恢复。
  // 这些都是纯加载时机的调整，不改变任何内容或视觉
  const deferred = [];
  function holdHeavyMedia() {
    document.querySelectorAll("video").forEach((v) => {
      if (hero && hero.contains(v)) return; // Hero 本身要立刻可见
      const src = v.getAttribute("src");
      if (!src) return;
      deferred.push({ el: v, src, autoplay: v.hasAttribute("autoplay") });
      v.removeAttribute("autoplay");
      v.pause();
      v.removeAttribute("src");
      v.load(); // 中止已经开始的请求
    });
  }
  function releaseHeavyMedia() {
    deferred.forEach(({ el, src, autoplay }) => {
      el.setAttribute("src", src);
      if (autoplay) el.setAttribute("autoplay", "");
      el.load();
      if (autoplay) el.play().catch(() => {});
    });
    deferred.length = 0;
  }

  // 进场期间的滚动钳制（在下面真正就位后赋值；提前声明是因为 finish
  // 可能在各种早退路径里先被调用）
  let unclampFn = null;

  // 不管接下来成不成功，页面都必须回到可见状态，绝不能把内容永久藏住
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    // 顺序很重要：先摘属性让进场那套 CSS 全部失效，再清 Hero 的 inline
    // 样式。反过来的话中间会有一帧 Hero 被 CSS 弹回起点小 box
    root.removeAttribute("data-case-enter");
    if (hero) hero.removeAttribute("style");
    ["--enter-x", "--enter-y", "--enter-w", "--enter-h"].forEach((p) =>
      root.style.removeProperty(p)
    );
    releaseHeavyMedia();
    // 解除进场期间的滚动钳制，并最后归零一次——落点必须是页面顶部
    if (unclampFn) unclampFn();
    window.scrollTo(0, 0);
    // 进场期间元素处于隐藏/被 transform 改写的状态，这里通知
    // js/case.js、js/case-duolingo.js 现在才是建立 ScrollTrigger 的时机
    window.dispatchEvent(new Event("case:entered"));
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  if (!hero || !window.gsap) {
    finish();
    return;
  }

  const px = (n) => parseFloat(getComputedStyle(root).getPropertyValue(n)) || 0;
  const from = { x: px("--enter-x"), y: px("--enter-y"), w: px("--enter-w"), h: px("--enter-h") };
  if (!from.w || !from.h) {
    finish();
    return;
  }

  holdHeavyMedia();

  // 把 Work 页那个视频的播放进度接过来。
  // 两个页面用的是同一个 hero.mp4，但 Case 页这个 <video> 是新元素，
  // autoplay 默认从 0 秒开始播——于是位置虽然连续，画面内容却会从
  // 「第 X 秒那一帧」突然跳到「第 0 秒那一帧」，看起来就是闪一下。
  // Work 页交接时已经把 currentTime 存进了 dataset.caseEnterTime，
  // 这里读回来对上，画面才是接着播的
  const heroVideo = hero.querySelector("video");
  const startTime = parseFloat(root.dataset.caseEnterTime) || 0;

  // 用 Work 页交接过来的「最后一帧截图」当 poster 垫底：本页视频要经过
  // 下载→解码→seek 才有画面，首屏那一帧原本只有容器的 #141414 深灰底，
  // 和旧页面最后一帧（有画面）拼在一起就是闪的那一下。poster 是同一幅
  // 画面，首帧就有内容，交界处看不出换过页。视频真正播起来后 poster
  // 自动被替换，不需要手动清理
  if (window.__caseEnterPoster) {
    if (heroVideo) {
      heroVideo.setAttribute("poster", window.__caseEnterPoster);
    } else {
      /* Hero 是 <img>/GIF（比如 Chicken 5 Road）时没有 poster 属性，
         把同一帧铺在容器背景上当垫底，效果等价：图片解码完成后
         自己盖在上面，背景图看不见，finish() 里再清掉 */
      hero.style.backgroundImage = "url(" + window.__caseEnterPoster + ")";
      hero.style.backgroundSize = "cover";
      hero.style.backgroundPosition = "center";
    }
    window.__caseEnterPoster = "";
  }
  function syncHeroTime() {
    if (!heroVideo || !startTime) return;
    try {
      const d = heroVideo.duration;
      if (d && isFinite(d)) heroVideo.currentTime = startTime % d;
    } catch (e) {
      /* metadata 未就绪时设 currentTime 会抛错，交给下面的监听补上 */
    }
  }
  if (heroVideo) {
    if (heroVideo.readyState >= 1) syncHeroTime();
    else heroVideo.addEventListener("loadedmetadata", syncHeroTime, { once: true });
  }

  // Hero 自己也带 .case-module，会被 js/case.js 的通用揭示动画从
  // opacity:0 + y:22 再播一遍——morph 刚落位就又闪一下。用站内已有的
  // 逃生舱把它排除掉。只在从 Work 页 morph 进来时加，直接打开本页时
  // 行为完全不变
  hero.classList.add("case-module-no-reveal");

  // 进场必须停在页面顶部：不保留 Work 页的旧滚动位置。
  // 光归零一次不够——进场这 1.2 秒里布局剧烈变化（Hero 脱离/回归文档流、
  // content-visibility 撤销、pin-spacer 插入），浏览器的 scroll anchoring
  // /恢复机制会趁机把页面滚到几百上千像素外，首屏分类和 reveal 全被
  // 带偏。进场期间直接把滚动钳在 0，finish 时解除
  window.scrollTo(0, 0);
  const clampScroll = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
  addEventListener("scroll", clampScroll, { passive: true });
  unclampFn = () => removeEventListener("scroll", clampScroll);

  // 量终点 = Hero 在正常文档流里的真实 bounding box（实测，不写死）。
  // CSS 现在已经把它 fixed 在起点小 box 上了，所以先临时还原成自然状态
  // 量一次再摆回去——这一整段是同一个同步任务，浏览器不会在中间绘制，
  // 所以量归量，屏幕上不会闪
  const inlineBefore = hero.getAttribute("style") || "";
  hero.style.cssText =
    inlineBefore + ";position:static;left:auto;top:auto;width:auto;height:auto;margin:0;";
  const to = hero.getBoundingClientRect();
  const toBox = { x: to.left, y: to.top, w: to.width, h: to.height };
  hero.setAttribute("style", inlineBefore);

  if (!toBox.w || !toBox.h) {
    finish();
    return;
  }

  // 刚刚量到的就是 Hero 的真实自然位置，顺手刷新缓存，
  // 下一次从 Work 页点进来就能直接用它当终点
  try {
    localStorage.setItem(
      "case-hero-box:" + SLUG,
      JSON.stringify({
        x: Math.round(toBox.x),
        y: Math.round(toBox.y + window.scrollY),
        w: Math.round(toBox.w),
        h: Math.round(toBox.h),
        vw: window.innerWidth,
        vh: window.innerHeight,
      })
    );
  } catch (e) {
    /* 忽略 */
  }

  // 摆到终点 box 上（仍然 fixed，视觉位置和自然位置一致），再用 transform
  // 把它映射回起点 box。之后只动 transform——纯合成层，不触发布局，
  // 每一帧都能满帧跑
  hero.style.left = toBox.x + "px";
  hero.style.top = toBox.y + "px";
  hero.style.width = toBox.w + "px";
  hero.style.height = toBox.h + "px";

  // 两边同为 16:9，所以是等比 scale + 位移，不会变形、不会重新裁切
  const scale = from.w / toBox.w;
  const dx = from.x + from.w / 2 - (toBox.x + toBox.w / 2);
  const dy = from.y + from.h / 2 - (toBox.y + toBox.h / 2);
  gsap.set(hero, { x: dx, y: dy, scale, transformOrigin: "50% 50%", force3D: true });

  // 动画一结束就把 Hero 交还给正常文档流。此刻 transform 已经是恒等、
  // 位置和自然位置完全重合，所以换回去看不出任何跳动；必须赶在下面
  // 其余内容淡入之前做，否则内容会按「少了 Hero 的高度」排一次版。
  //
  // 注意这里不能简单地 removeAttribute("style")：那时候 <html> 上的
  // data-case-enter 还在（它还要继续控制其余内容的隐藏），一旦 inline
  // 样式没了，css/case.css 里那条把 Hero 钉在起点小 box 上的
  // position:fixed 规则就会重新生效——Hero 会瞬间弹回小图，并且以
  // z-index:80 悬浮在已经淡入的正文上面，看起来就是「动画完又卡一下、
  // 还和内容重叠」。所以这里改成用 inline 样式显式压过那条规则，
  // 真正的清理留到 finish() 里、把属性摘掉之后再做
  function releaseHero() {
    gsap.set(hero, { clearProps: "transform" });
    hero.style.position = "static";
    hero.style.left = "auto";
    hero.style.top = "auto";
    hero.style.width = "auto";
    hero.style.height = "auto";
    hero.style.margin = "";
    hero.style.zIndex = "auto";
    hero.style.transform = "none";
    hero.style.willChange = "auto";
  }

  const sidebar = document.querySelector(".case-sidebar-inner");
  const sidebarBits = document.querySelectorAll(
    ".case-sidebar-inner .case-title, .case-sidebar-inner .case-tagline, .case-sidebar-inner .case-meta, .case-sidebar-inner .case-toc a"
  );
  const restOfContent = document.querySelectorAll(".case-content > *:not(#overview)");
  const overviewBits = document.querySelectorAll("#overview > *:not(#case-hero-media)");
  const chrome = document.querySelectorAll(".site-nav, .site-footer");

  function run() {
    const tl = gsap.timeline({
      onComplete() {
        gsap.set([sidebar], { clearProps: "opacity,transform" });
        gsap.set(sidebarBits, { clearProps: "opacity,transform" });
        gsap.set(restOfContent, { clearProps: "opacity" });
        gsap.set(overviewBits, { clearProps: "opacity" });
        gsap.set(chrome, { clearProps: "opacity" });
        finish();
      },
    });

    // ① 图片：从 Work preview 的位置连续移动 + 等比放大到真实位置。
    //    到位就立刻交还给文档流，再往后才轮到其余内容淡入
    // 接着 Work 页那段继续走完剩下的行程。缓动和上一段保持一致（out：
    // 起步快、随后减速），两段拼起来是一条连续的减速运动，交界处不会
    // 出现「减速到 0 又重新加速」的顿挫
    tl.to(hero, {
      x: 0, y: 0, scale: 1, duration: 0.55, ease: "power2.out",
      onComplete: releaseHero,
    }, 0);

    // ② 图片走到约 80% 之后，才开始出现页面结构
    tl.fromTo(sidebar, { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.42, ease: "power3.out" }, 0.44);
    tl.fromTo(sidebarBits, { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.36, ease: "power2.out", stagger: 0.055 }, 0.49);

    // ③ 最后其余内容和顶栏/底栏轻微淡入
    tl.to(overviewBits, { opacity: 1, duration: 0.34, ease: "power2.out" }, 0.61);
    tl.to(restOfContent, { opacity: 1, duration: 0.34, ease: "power2.out" }, 0.63);
    tl.to(chrome, { opacity: 1, duration: 0.34, ease: "power2.out" }, 0.63);
  }

  // 立刻起跑，不再等帧：Hero 的起点位置已经由 CSS 在首屏就绪了，
  // 这里每多等一帧都是白白多停顿一帧
  run();
})();
