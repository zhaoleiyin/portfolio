(() => {
  "use strict";

  const section = document.querySelector(".work");
  if (!section) return;

  const track = section.querySelector(".work-track");
  const mediaEls = Array.from(section.querySelectorAll(".work-media"));
  const infoItems = Array.from(section.querySelectorAll(".work-info-item"));
  if (!mediaEls.length || !infoItems.length || mediaEls.length !== infoItems.length) return;

  const hasGSAP = !!window.gsap;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 左侧文字块的位置是固定 editorial grid（title/desc/meta 各自的
  // top 偏移写死在 CSS 里，见 work.css），不再用 JS 按内容高度测量、
  // 重新分布版面——这样不管标题一行还是两行，各区块起始位置都一致。

  let activeIndex = 0;

  // 标题用滚轮式切换（类似 Apple 闹钟切数字）：固定高度 + overflow:hidden
  // 的槽位（.work-title-frame，见 work.css），旧标题整段滑出槽位被裁掉，
  // 新标题从槽位另一侧滑入——纯位移，不叠加透明度。
  // 正文/meta 完全不受影响，还是原来更轻更稳定的小幅度 fade。
  // 两组仍然共用同一条时间线，退出/进入两个阶段整体上顺序发生
  // （旧的先完全退出，新的才进入），不会整块一起跳变
  function bodyParts(item) {
    return [item.querySelector(".work-desc"), item.querySelector(".work-tag")].filter(Boolean);
  }
  function titleEl(item) {
    return item ? item.querySelector(".work-title") : null;
  }
  // 滑动距离用标题自己的渲染高度，不是槽位（.work-title-frame）的固定
  // 高度——槽位按最高的两行标题（Step Inside Tomorrow）撑到了 101px，
  // 如果每次切换都按这个距离滑，像 SVP 这种一行标题也会被甩出一大截、
  // 明显偏快偏猛。标题一行高多少就滑多少，两行的自然滑得远一点，
  // 一行的滑得更短更克制，槽位本身依然是 overflow:hidden 兜底裁切
  function titleHeight(item) {
    const t = titleEl(item);
    return t ? t.offsetHeight : 0;
  }
  // 把每个槽位（.work-title-frame）的高度改成刚好等于它自己标题的
  // 实际高度——CSS 里写的是两行标题的高度，只是没有 JS 时的兜底；
  // 如果所有槽位都用那个偏高的兜底值，一行标题往下停靠 51px 后
  // 还留在这个 101px 高的槽位可视范围内，没有真正被裁掉，会跟
  // 旁边其它 case 的标题重叠。每个槽位量出自己标题的高度后，
  // "停靠一个自身高度的距离"就正好等于"滑出这个槽位"，不会再露出来
  function setupTitleFrames() {
    infoItems.forEach((el) => {
      const frame = el.querySelector(".work-title-frame");
      const h = titleHeight(el);
      if (frame && h) frame.style.height = h + "px";
    });
  }

  const TITLE_EXIT_DUR = 0.6;
  const TITLE_ENTER_DUR = 0.68;
  const TITLE_EASE = "power3.inOut"; // 进出都带一点缓入缓出，更像机械滚轮而不是弹性

  const BODY_DIST = 5;        // 正文/meta：现在这种更轻更稳定的 fade
  const BODY_EXIT_DUR = 0.3;
  const BODY_ENTER_DUR = 0.35;
  const BODY_EASE = "power2.out";
  const BODY_STAGGER = 0.05;

  function initInfoState() {
    infoItems.forEach((el, i) => {
      const title = titleEl(el);
      const body = bodyParts(el);
      const visible = i === activeIndex;
      if (hasGSAP) {
        // 非当前项的标题直接停在（自己高度那么远的）槽位外，被 frame 的
        // overflow:hidden 裁掉，不用 opacity——纯粹靠位移+裁切决定看不看得见
        if (title) gsap.set(title, { y: visible ? 0 : titleHeight(el) });
        gsap.set(body, { opacity: visible ? 1 : 0, y: 0 });
      } else {
        if (title) title.style.opacity = visible ? "1" : "0";
        body.forEach((p) => { p.style.opacity = visible ? "1" : "0"; });
      }
    });
  }

  let switchTl = null;

  // 快速滚动（比如滚到底又反向滑回来）时，onUpdate 可能在一次切换的
  // 动画还没播完（TITLE_EXIT/ENTER_DUR 加起来小一秒）就又算出了新的
  // bestIndex——switchTl.kill() 只会冻结"当时正在参与的那一对"元素，
  // 冻结时它们可能还停在半途的 y 值上；而下一次 switchInfo 只处理
  // "新的那一对"，中途被冻结、又不在新一对里的标题/正文就再也没人
  // 管了，永远停在半透明/半露出的位置——这正是"标题和正文重叠"的
  // 真正原因。每次真正开始切换前，先把所有跟这次切换无关的项强制
  // 瞬间归位到"相对新 activeIndex 该在的位置"（在它前面就已完全滑出、
  // 在它后面就还没滑入、正文一律淡出），不管它们之前是不是被打断过
  function settleOthers(newIndex, prevIndex) {
    infoItems.forEach((el, i) => {
      if (i === newIndex || i === prevIndex) return;
      const title = titleEl(el);
      const body = bodyParts(el);
      if (hasGSAP) {
        if (title) gsap.killTweensOf(title);
        gsap.killTweensOf(body);
        const h = titleHeight(el);
        if (title) gsap.set(title, { y: i < newIndex ? -h : h });
        gsap.set(body, { opacity: 0, y: 0 });
      } else {
        if (title) title.style.opacity = "0";
        body.forEach((p) => { p.style.opacity = "0"; });
      }
    });
  }

  function switchInfo(newIndex, prevIndex) {
    if (newIndex === prevIndex) return;
    settleOthers(newIndex, prevIndex);
    const cur = infoItems[prevIndex];
    const next = infoItems[newIndex];
    const sign = newIndex > prevIndex ? 1 : -1;

    const curTitle = titleEl(cur);
    const curBody = cur ? bodyParts(cur) : [];
    const nextTitle = titleEl(next);
    const nextBody = bodyParts(next);
    const curTitleH = curTitle ? curTitle.offsetHeight : 0;
    const nextTitleH = nextTitle ? nextTitle.offsetHeight : 0;

    if (hasGSAP && !reducedMotion) {
      if (switchTl) switchTl.kill();
      switchTl = gsap.timeline();
      const exitEnd = Math.max(TITLE_EXIT_DUR, BODY_EXIT_DUR);

      // 退出：标题滑出自己的高度就够了（被 frame 裁掉，不淡出）；
      // 正文/meta 同时起步，做原来那种轻量 fade
      if (curTitle) {
        switchTl.to(curTitle, { y: -curTitleH * sign, duration: TITLE_EXIT_DUR, ease: TITLE_EASE }, 0);
      }
      if (curBody.length) {
        switchTl.to(curBody, { opacity: 0, y: -BODY_DIST * sign, duration: BODY_EXIT_DUR, ease: BODY_EASE, stagger: BODY_STAGGER }, 0);
      }

      // 进入：等两边都退出完（取较长的那个）才开始——新标题从自己
      // 高度那么远的地方滑入槽位，正文/meta 同步轻量 fade in
      if (nextTitle) {
        switchTl.fromTo(
          nextTitle,
          { y: nextTitleH * sign },
          { y: 0, duration: TITLE_ENTER_DUR, ease: TITLE_EASE },
          exitEnd
        );
      }
      switchTl.fromTo(
        nextBody,
        { opacity: 0, y: BODY_DIST * sign },
        { opacity: 1, y: 0, duration: BODY_ENTER_DUR, ease: BODY_EASE, stagger: BODY_STAGGER },
        exitEnd
      );
    } else {
      if (curTitle) curTitle.style.opacity = "0";
      curBody.forEach((p) => { p.style.opacity = "0"; });
      if (nextTitle) nextTitle.style.opacity = "1";
      nextBody.forEach((p) => { p.style.opacity = "1"; });
    }
  }

  // ── 右侧 media 轨道：给首尾留出 padding，让第一个/最后一个 case
  // 也能在滚动中真正到达视口垂直中心（否则轨道尽头没有余量可以居中）──
  function layoutTrack() {
    track.style.paddingTop = "0px";
    track.style.paddingBottom = "0px";
    const vh = window.innerHeight;
    const firstH = mediaEls[0].getBoundingClientRect().height;
    const lastH = mediaEls[mediaEls.length - 1].getBoundingClientRect().height;
    track.style.paddingTop = Math.max(0, vh / 2 - firstH / 2) + "px";
    track.style.paddingBottom = Math.max(0, vh / 2 - lastH / 2) + "px";
  }

  const FALLOFF = 0.62; // 归一化距离超过这个比例时基本淡到最暗/最小/最远
  const MIN_OPACITY = 0.16;
  const MIN_SCALE = 0.9; // 离中心越远，图片轻微缩小，制造景深感
  // 这里原来有 PARALLAX_Y = 28（每张卡按离中心远近各自再偏移一点）。
  // 它和"相邻卡片最终视觉间距恒为 7px"在数学上互斥：只要相邻两张的
  // 纵向偏移不相等，间距就一定跟着变。现在纵向位移全部由下面的
  // syncGaps 按当前缩放值精确计算——它本身就是逐帧变化的位移动画，
  // 取代了视差项；缩放景深、透明度渐隐、切换、hover 全部保留。
  // inactive case 被 hover 时可以稍微提亮，但设了封顶，
  // 永远到不了 active case 的 opacity:1
  const HOVER_BOOST = 0.22;
  const HOVER_CEILING = 0.82;
  const hovered = new Set();

  // smoothstep：中心附近和远端变化都更缓，中段变化更快——
  // 比线性插值更有"被带入/离开"的空间感，而不是匀速平移
  function ease(t) {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }

  // 每个 media 一套 quickTo setter：opacity/scale 各自带一点惯性缓动，
  // 不是逐帧瞬间跳变到目标值，滚动时更连续、更平滑（参考 joffreyspitzer.com
  // 的 case 切换质感），而不是普通的"贴着滚动条线性位移"
  // 注意：quickTo 对复合简写属性 "scale" 不生效（GSAP 3.15 下实测无动画，
  // 必须拆成 scaleX / scaleY 两个独立属性各自 quickTo）。
  // y 不走 quickTo：它是"按当前这一帧真实缩放值算出来的间距补偿"，
  // 必须和 scale 严格同步，由 syncGaps 每帧直接设值。
  //
  // 写成"可重建"而不是建一次用到死：quickTo 的机制是一条常驻 tween 反复
  // resetTo，任何 killTweensOf(el) 都会把这条 tween 杀死，之后再调用这个
  // setter 就是无声的空操作——之前"从 case 页返回后整个动画冻住"的根因
  // 就是 update(true) 里的 killTweensOf 把它们全杀了。所以立即就位之后
  // 必须重建一批新的 setter（见 update 的 immediate 分支）
  let setters = null;
  function buildSetters() {
    setters = mediaEls.map((el) => ({
      opacity: gsap.quickTo(el, "opacity", { duration: 0.5, ease: "power2.out" }),
      scaleX: gsap.quickTo(el, "scaleX", { duration: 0.6, ease: "power2.out" }),
      scaleY: gsap.quickTo(el, "scaleY", { duration: 0.6, ease: "power2.out" }),
    }));
  }
  if (hasGSAP && !reducedMotion) buildSetters();

  /* ── 布局尺寸缓存 ──
     下面所有"这张卡片在哪、多高"的判断都用布局值，不用
     getBoundingClientRect()：一来 rect 里含着 syncGaps 写进去的位移，
     拿它反推会形成自己喂自己的闭环；二来每帧强制同步重排再紧跟着写
     6 个 transform 是典型的读写交替（layout thrashing），负载高的机器
     会直接掉帧。这里只在初始化 / resize / ScrollTrigger refresh 时测一次。 */
  let layout = null;
  function measureLayout() {
    const cs = getComputedStyle(track);
    const gap = parseFloat(cs.rowGap || cs.gap) || 0;
    // 高度必须是精确浮点值（offsetHeight 是取整的，0.4px 的误差不会
    // 抵消，直接变成缝隙误差）。rect.height 含当前缩放，除回去即是
    // 未缩放的真实布局高度，与缓动进行到哪一帧无关
    const hs = mediaEls.map((el) => {
      const sy = hasGSAP ? Number(gsap.getProperty(el, "scaleY")) || 1 : 1;
      return el.getBoundingClientRect().height / sy;
    });
    layout = {
      padTop: parseFloat(cs.paddingTop) || 0,
      gap: gap,
      hs: hs,
      // 轨道在文档里的绝对纵坐标：每帧用 trackDocTop - scrollY 得到它在
      // 视口里的位置，全程不再碰 getBoundingClientRect
      trackDocTop: track.getBoundingClientRect().top + window.scrollY,
      trackH: track.offsetHeight,
      tops: [],
    };
    // 布局顶同样按精确浮点累加（offsetTop 也是取整的）：
    // 卡片是同一个 flex 列的连续兄弟，顶 = 前一张的顶 + 高 + gap
    layout.tops[0] = 0;
    for (let i = 1; i < hs.length; i++) layout.tops[i] = layout.tops[i - 1] + hs[i - 1] + gap;
  }
  // 某张卡片布局上的顶边在视口里的位置
  function layoutTop(i, trackTop) {
    return trackTop + layout.padTop + layout.tops[i];
  }
  // 每帧写 y 用 quickSetter（属性解析预先绑定，每帧只做赋值），
  // 且与上一帧相同就跳过整轮写入
  const ySetters = hasGSAP && !reducedMotion
    ? mediaEls.map((el) => gsap.quickSetter(el, "y", "px"))
    : null;
  const lastY = mediaEls.map(() => null);

  /* ── 视觉间距补偿：恒定 7px 的核心 ──
     景深缩放绕元素中心做：布局高 H 的卡片缩到 s 后上下各空出 H(1-s)/2，
     相邻两张各让一半，屏幕缝隙 = 布局 gap + 相邻两张的空隙之和
     （H=406、s=0.9 时 = 7 + 40.6 = 47.6px，与未补偿时的实测一致）。

     这里不动 scale（景深保留），而是按当前这一帧真实的缩放值把整列
     重新排一遍：
       渲染顶(i) = 渲染顶(i-1) + H(i-1)·s(i-1) + gap
     再给每张卡片写 translateY 把它从"只有缩放时会落在的位置"挪过去。
     相邻缝隙于是恒等于 gap，与各自缩放到多少无关。

     锚点用视口中心的连续插值位置（不是取整的"当前卡片下标"），
     否则每换一张当前卡片整列会跳一下。
     gsap.getProperty 读到的是 quickTo 缓动中的**当前**值而不是目标值，
     所以缩放动画进行到一半时缝隙也是准的。 */
  function syncGaps() {
    if (!setters || !layout) return;
    const n = mediaEls.length;
    if (n < 2) return;
    // 进场过渡一旦开始（某张卡片被 pin 成 fixed 交给 work-transition.js），
    // 整条轨道冻住不再重排——那张卡片脱离文档流后这条链的输入变了，
    // 重算会让其余卡片平移几个像素，正好在遮罩淡入时看得见
    for (let i = 0; i < n; i++) if (mediaEls[i].dataset.workPinned) return;
    const trackTop = layout.trackDocTop - window.scrollY;
    // 整条轨道在视口外（留一屏余量）时不算：Work 区之外每帧白跑没有意义
    const margin = window.innerHeight;
    if (trackTop > margin || trackTop + layout.trackH < -margin) return;
    const { gap, hs } = layout;
    const s = mediaEls.map((el) => Number(gsap.getProperty(el, "scaleY")) || 1);
    // 只有缩放时每张卡片会落在的位置
    const natural = mediaEls.map((el, i) => layoutTop(i, trackTop) + (hs[i] * (1 - s[i])) / 2);
    // 期望的渲染位置：一张接一张，缝隙恒为 gap
    const desired = new Array(n);
    desired[0] = 0;
    for (let i = 1; i < n; i++) desired[i] = desired[i - 1] + hs[i - 1] * s[i - 1] + gap;
    // 锚点：视口中心落在哪两张之间，就把那个插值位置钉住
    const centerY = window.innerHeight / 2;
    const lc = (i) => layoutTop(i, trackTop) + hs[i] / 2;
    let k = 0;
    while (k < n - 2 && lc(k + 1) < centerY) k++;
    const span = lc(k + 1) - lc(k);
    const f = span > 0 ? Math.min(1, Math.max(0, (centerY - lc(k)) / span)) : 0;
    const shift =
      natural[k] + (natural[k + 1] - natural[k]) * f -
      (desired[k] + (desired[k + 1] - desired[k]) * f);
    for (let i = 0; i < n; i++) {
      const v = desired[i] + shift - natural[i];
      if (lastY[i] !== null && Math.abs(v - lastY[i]) < 0.01) continue;
      lastY[i] = v;
      ySetters[i](v);
    }
  }

  /* immediate = true 时不走 quickTo 补间，直接把缩放/透明度设到位。
     首次加载和 bfcache 返回用这一档：quickTo 会从 scale 1 缓动到 0.9，
     而 syncGaps 的补偿跟着当前缩放走，那 0.6 秒里补偿量从 ~0 长到
     ~200px，整列就会肉眼可见地滑一下。首帧直接就位则没有这段过程。 */
  function update(immediate) {
    if (!layout) measureLayout();
    const vh = window.innerHeight;
    const centerY = vh / 2;
    // 用布局中心判定，不用 rect 中心：rect 里含着 syncGaps 写的位移
    const trackTop = layout.trackDocTop - window.scrollY;
    let bestIndex = activeIndex;
    let bestDist = Infinity;
    const targets = mediaEls.map((el, i) => {
      const elCenter = layoutTop(i, trackTop) + layout.hs[i] / 2;
      const dist = Math.abs(elCenter - centerY);
      const eased = ease(dist / (vh * FALLOFF));
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
      return {
        opacity: Math.max(MIN_OPACITY, 1 - eased * (1 - MIN_OPACITY)),
        scale: Math.max(MIN_SCALE, 1 - eased * (1 - MIN_SCALE)),
      };
    });
    mediaEls.forEach((el, i) => {
      let { opacity, scale } = targets[i];
      // 二次修正：inactive 且被 hover 的 case，在基础值上提亮但封顶
      if (i !== bestIndex && hovered.has(el)) {
        opacity = Math.min(HOVER_CEILING, opacity + HOVER_BOOST);
      }
      if (el.dataset.workPinned) return; // 已交给进场过渡，别再写它
      if (setters) {
        if (immediate) {
          // 清掉在途的旧补间再就位。这一步会把 quickTo 的常驻 tween 一起
          // 杀死——所以下面（forEach 之后）必须 buildSetters() 整批重建，
          // 否则后续所有 setter 调用都是空操作、动画冻结
          gsap.killTweensOf(el);
          gsap.set(el, { opacity: opacity, scaleX: scale, scaleY: scale });
        } else {
          setters[i].opacity(opacity);
          setters[i].scaleX(scale);
          setters[i].scaleY(scale);
        }
      } else {
        el.style.opacity = String(opacity);
      }
    });
    // 立即就位杀掉了 quickTo 的常驻 tween，这里整批重建，保证动画链
    // 永远是活的（6 张卡 × 3 个属性，开销可忽略）
    if (immediate && setters) buildSetters();
    if (bestIndex !== activeIndex) {
      switchInfo(bestIndex, activeIndex);
      activeIndex = bestIndex;
    }
  }

  mediaEls.forEach((el) => {
    el.addEventListener("mouseenter", () => { hovered.add(el); update(); });
    el.addEventListener("mouseleave", () => { hovered.delete(el); update(); });
  });

  function layoutAll() {
    setupTitleFrames();
    layoutTrack();
    measureLayout();
    for (let i = 0; i < lastY.length; i++) lastY[i] = null; // 重测后必须重写一次
    update(true);
    syncGaps(); // 不等下一帧，首帧的间距就是对的
  }


  setupTitleFrames();
  initInfoState();
  layoutAll();

  if (hasGSAP && window.ScrollTrigger) {
    ScrollTrigger.create({
      trigger: section,
      start: "top bottom",
      end: "bottom top",
      // 不能直接传 update：onUpdate 的第一个实参是 ScrollTrigger 实例，
      // 会被当成 immediate=true，每次滚动都变成瞬间就位、丢掉缓动
      onUpdate: () => update(),
      onRefresh: layoutAll,
    });
  } else {
    addEventListener("scroll", () => update(), { passive: true }); // 同上：别把 Event 传成 immediate
  }

  // 补偿必须逐帧跑：scale 由 quickTo 缓动，滚动停下后它还会继续走
  // 一小段，只挂在 scroll 事件上的话那段时间缝隙又会不对。
  // syncGaps 自带空转保护（轨道在视口外、或与上一帧无变化时直接返回）
  if (setters) gsap.ticker.add(syncGaps);

  /* 浏览器 Back 走 bfcache 时脚本不会重跑，DOM 是被冻结着搬回来的：
     卡片身上还留着跳转那一刻的 transform，占位块也还在。
     js/work-transition.js 的 restore() 会在 pageshow 里把这些还原掉，
     但它注册得比这里晚（脚本顺序在后），所以不能同步跑——放到下一帧，
     等 DOM 干净了再重新按当前滚动位置算一遍 */
  addEventListener("pageshow", (e) => {
    if (e.persisted) requestAnimationFrame(layoutAll);
  });

  let resizeT = null;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(layoutAll, 150);
  });
})();
