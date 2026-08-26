/* ────────────────────────────────────────────────────────────
   Work → Case Study 的 shared-element 进场过渡（目前只接 Duolingo
   一个，验收通过之后再复制给其它项目）。

   跨文档没法用一条 GSAP 时间轴从头连到尾，所以拆成两段，靠
   sessionStorage 交接：
     ① 本文件（Work 页）：点击 Duolingo Hero 之后不立刻换页——先把
        整页其它内容淡进黑底里（Hero 浮在遮罩之上，始终保持最高视觉
        权重），Hero 自己只做极轻微的放大，不做位移，避免「猜一个
        方向先动一下、到了新页面又被纠正」的折返感。淡出结束时把
        Hero 此刻真实的 bounding box 和视频播放进度写进 sessionStorage，
        然后才真正跳转。
     ② work/duolingo.html 那边（见 js/case-enter.js）：用这个 box 作为
        起点，morph 到 Case 页 Hero 真实 DOM 的 bounding box，再按
        节奏揭示页面结构。

   两页背景都是同一个黑（#0a0a0a），交接的那一帧 Hero 位置、尺寸、
   视频帧都对得上，所以看起来是同一张图在连续移动，不是旧图淡出、
   新图淡入。
   降级：prefers-reduced-motion、窄屏、没有 GSAP 时完全不介入，
   走浏览器默认跳转。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  /* 所有 case 共用这一套：凡是 id 形如 work-media-<slug> 且 href 是
     真实页面的 .work-media，点击后都走同一条进场过渡。加新 case 时
     只要在 index.html 里按同样的方式接线即可，这个文件不用改 */
  const PREFIX = "work-media-";
  const SELECTOR = ".work-media[id^='" + PREFIX + "']";
  if (!document.querySelector(SELECTOR)) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isDesktop = () => window.innerWidth >= 900;

  // 用 capture 挂在 document 上：这样一定早于 .work-media 元素自己身上
  // 那个（js/work-cursor.js 里的）click 处理器，stopPropagation 之后
  // 事件不会再传到目标元素，不会出现两套跳转逻辑同时跑
  document.addEventListener(
    "click",
    (e) => {
      const link = e.target.closest && e.target.closest(SELECTOR);
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href === "#") return;
      if (reducedMotion || !window.gsap || !isDesktop()) return; // 正常跳转

      e.preventDefault();
      e.stopPropagation();
      play(href, link, link.id.slice(PREFIX.length));
    },
    true
  );

  let running = false;

  /* 这次过渡对首页做过的所有改动，全部登记在这里，供 restore() 撤销。
     浏览器 Back 时如果页面走 bfcache（不重新执行脚本，只把冻结的 DOM
     原样搬回来），这些改动会连同「跳转前最后一帧」一起被恢复——表现
     就是首页被那层不透明黑幕盖住、只剩一张浮在最上层的 Hero 图，而且
     因为脚本不会重跑，永远不会自己恢复。所以必须留一份可撤销的记录 */
  let pending = null;

  function restore() {
    if (!pending) return;
    const { link, veil, placeholder, styleBefore, tl } = pending;
    pending = null;
    if (tl) tl.kill(); // pause 只是停住，kill 才会把 tween 从全局时间轴摘掉
    if (veil && veil.parentNode) veil.remove();
    if (placeholder && placeholder.parentNode) placeholder.remove();
    if (link) {
      // 精确还原：有原始 inline style 就写回原值，本来没有就整个删掉，
      // 不留 position/z-index/transform 之类的残余
      if (styleBefore === null) link.removeAttribute("style");
      else link.setAttribute("style", styleBefore);
      gsap.killTweensOf(link);
      // 交还给 work-track.js 继续管
      delete link.dataset.workPinned;
    }
    running = false;
  }

  /* bfcache 恢复的唯一可靠信号：pageshow 且 persisted 为 true。
     load / DOMContentLoaded 在这种恢复下都不会再触发，所以清理只能
     挂在这里。非 bfcache 的正常返回（整页重载）本来就会重建 DOM，
     这个分支不会命中，也不需要它 */
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) restore();
  });

  function play(href, link, SLUG) {
    if (running) return;
    running = true;

    /* Hero 素材可能是 <video>（Duolingo）也可能是 <img>/GIF
       （Chicken 5 Road）——两者都能被 canvas 的 drawImage 截帧，
       下面统一处理；只有播放进度 currentTime 是视频独有的 */
    const media = link.querySelector("video, img");
    const video = media && media.tagName === "VIDEO" ? media : null;

    // 一层纯黑遮罩盖住页面其它所有内容；Hero 被单独提到遮罩之上，
    // 于是「其它元素淡出、图片保持最高视觉权重」用一个元素就够了，
    // 不用去逐个挑选、修改其它项目的 DOM
    const veil = document.createElement("div");
    veil.setAttribute("aria-hidden", "true");
    veil.style.cssText =
      "position:fixed;inset:0;background:#0a0a0a;opacity:0;z-index:90;pointer-events:none;";
    document.body.appendChild(veil);

    // Hero 提到遮罩之上。用 fixed + 当前 bounding box 就位，避免受
    // 祖先层叠上下文影响导致提不上去。
    //
    // 这里有两个必须分清的尺寸：
    //   b  = getBoundingClientRect()：屏幕上真正看到的框，含 work-track
    //        给卡片写的 transform（景深缩放 + 间距补偿位移）
    //   布局尺寸 = offsetWidth/offsetHeight：卡片在 flex 列里实际占的格子
    // 两者不一样（缩放 0.9 时差约 41px 高）。
    const b = link.getBoundingClientRect();
    const placeholder = document.createElement("div");
    // 占位块必须用**布局**尺寸：卡片马上要脱离文档流，占位块要顶替的是
    // 它在列里占的那个格子。之前这里用的是 b（缩小后的渲染尺寸），
    // 于是轨道整体塌掉约 41px，下面的卡片全部上移——这就是"点开会跳"
    // 的其中一半
    placeholder.style.cssText =
      "width:" + link.offsetWidth + "px;height:" + link.offsetHeight + "px;";
    link.parentNode.insertBefore(placeholder, link);
    // 改写之前先把原始 inline style 原样存下来（可能本来就没有 → null）
    const styleBefore = link.getAttribute("style");
    // 告诉 work-track.js：这张卡片已经交给过渡动画了，别再往它身上写
    // 缩放/透明度/间距补偿，否则两边会互相打架
    link.dataset.workPinned = "1";
    if (window.gsap) gsap.killTweensOf(link);
    Object.assign(link.style, {
      position: "fixed",
      left: b.left + "px",
      top: b.top + "px",
      width: b.width + "px",
      height: b.height + "px",
      margin: "0",
      zIndex: "95",
      // 关键：清掉 transform。上面的 left/top/width/height 用的已经是
      // "含 transform 之后"的框，如果不清，浏览器会在这个新框上再叠一次
      // translateY(补偿) scale(s)——位置会整个错开、尺寸再缩一轮。
      // 清掉之后这一帧的画面和点击前完全一致，接下来的 morph 从这里起步
      transform: "none",
    });

    function handOff() {
      // 先把时间轴冻住，再记录 box。
      // 不冻的话时间轴会一直跑到 0.62s，而换页要花 60–200ms——等新页面
      // 画出来时，旧页面最后一帧其实已经比记录的位置又前进了 12–32px，
      // 新页面却按记录的（更早的）位置摆放，画面就会往回跳一下并缩窄。
      // 冻住之后，旧页面的最后一帧和新页面的第一帧是同一个 box，
      // 交接处不再有跳变
      tl.pause();
      const r = link.getBoundingClientRect();

      // 把此刻正在显示的那一帧截成图带过去。Case 页的视频要经过
      // 下载→解码→seek 才有画面，首屏那一帧本来只有容器的深灰底色
      // （#141414）——旧页面最后一帧是画面、新页面第一帧是灰框，这就是
      // 交接处闪的那一下。把这帧图交给 Case 页当 <video poster> 垫底，
      // 首帧画的就是同一幅画面。缩到 800 宽足够（显示尺寸内），
      // JPEG 压一下控制 sessionStorage 体积
      let poster = "";
      try {
        // <video> 用 videoWidth/Height，<img>/GIF 用 naturalWidth/Height，
        // drawImage 两者都吃（GIF 截到的就是当前正在显示的那一帧）
        const nw = video ? video.videoWidth : media && media.naturalWidth;
        const nh = video ? video.videoHeight : media && media.naturalHeight;
        if (media && nw && nh) {
          const c = document.createElement("canvas");
          const w = 800;
          c.width = w;
          c.height = Math.round((nh / nw) * w);
          c.getContext("2d").drawImage(media, 0, 0, c.width, c.height);
          poster = c.toDataURL("image/jpeg", 0.72);
        }
      } catch (err) {
        /* 截不了就算了，仅仅退回「首帧灰底」的旧行为 */
      }
      try {
        sessionStorage.setItem(
          "case-enter",
          JSON.stringify({
            slug: SLUG,
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
            ct: video ? video.currentTime : 0,
            poster: poster,
            t: Date.now(),
          })
        );
      } catch (err) {
        /* 隐私模式下 sessionStorage 可能不可写——那就退化成普通跳转 */
      }
      window.location.href = href;
    }

    // 终点：Case 页 Hero 的真实 box。它是上一次访问 Case 页时由
    // js/case-enter.js 实测后存下来的（不是写死的坐标），只在视口尺寸
    // 完全一致时才采用。有它就能在首页当帧朝正确方向平移+放大；
    // 没有它（第一次进站）就退化成一个方向正确、幅度保守的位移，
    // 剩下的交给 Case 页从交接 box 继续补完——两种情况都不会再空转
    const target = readCachedTarget(SLUG);
    const from = { x: b.left, y: b.top, w: b.width, h: b.height };
    let move;
    if (target) {
      const s = target.w / from.w;
      move = {
        x: target.x + target.w / 2 - (from.x + from.w / 2),
        y: target.y + target.h / 2 - (from.y + from.h / 2),
        scale: s,
      };
    } else {
      move = { x: -0.08 * innerWidth, y: -0.06 * innerHeight, scale: 1.15 };
    }

    const tl = gsap.timeline();
    // 图片：点击后立刻开始移动+放大，不再有「先原地待着」的那一段
    tl.to(link, {
      x: move.x,
      y: move.y,
      scale: move.scale,
      duration: 0.62,
      // 用 out 而不是 inOut：inOut 的起步速度接近 0，前 100ms 几乎不动，
      // 点下去仍然会被感知成「顿了一下才开始」。out 是一按下就有最大
      // 速度、随后减速，配合 Case 页那段同样的 out 缓动，整体是一条
      // 连续的减速运动
      ease: "power2.out",
    }, 0);
    // 其余内容同时淡进黑底，Hero 始终浮在遮罩之上
    tl.to(veil, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0);
    // 不等整段跑完就换页：这时图片正处在运动中段，Case 页会从交接的
    // 那个 box 无缝接着往下走，观感是一条连续的运动，而不是「动一段、
    // 停住、再动」。换页本身要花时间，所以提前交棒
    tl.call(handOff, null, 0.34);

    // 登记这次过渡的全部改动，等 bfcache 恢复时由 restore() 逐项撤销
    pending = { link, veil, placeholder, styleBefore, tl };
  }

  // 上一次访问 Case 页时实测并缓存下来的 Hero box。带上当时的视口尺寸，
  // 尺寸对不上就不用（避免换了窗口大小之后朝一个错误的位置飞）
  function readCachedTarget(SLUG) {
    try {
      const raw = localStorage.getItem("case-hero-box:" + SLUG);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.vw !== window.innerWidth || d.vh !== window.innerHeight) return null;
      if (!d.w || !d.h) return null;
      return d;
    } catch (e) {
      return null;
    }
  }
})();
