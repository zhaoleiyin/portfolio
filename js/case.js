/* ────────────────────────────────────────────────────────────
   Case Detail Page 通用交互，所有 case 共用同一份：
     1) 左侧 sticky 目录 scroll-spy——IntersectionObserver 盯着
        右侧每个 .case-section，当前项对应目录 a 加 .is-active，
        其余靠 CSS opacity 弱化（不用手动挨个算距离，TOC 只需要
        知道"是不是当前项"这个二元状态，比 Work 那种连续混合的
        cross-fade 简单，没必要照搬那套精细的距离计算）。
     2) 内容模块滚动进入视口时做一次轻量 fade + 位移揭示，呼应站内
        About/Work 已有的克制风格，用已加载的 GSAP + ScrollTrigger，
        不引入新库。
   case 之间的差异纯粹来自各自页面里放了哪些 section/module，
   这个文件不含任何某个具体 case 的内容或数据。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const sections = Array.from(document.querySelectorAll(".case-section[id]"));
  const tocLinks = Array.from(document.querySelectorAll(".case-toc a"));
  if (sections.length && tocLinks.length) {
    const linkFor = (id) => tocLinks.find((a) => a.getAttribute("href") === "#" + id);

    if ("IntersectionObserver" in window) {
      // rootMargin 把判定线收在视口偏上方一点，滚动经过一个 section
      // 的时候，目录高亮切换的时机更接近"内容真正进入主视野"，
      // 而不是刚露出底边就切
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const link = linkFor(entry.target.id);
            if (!link) continue;
            link.classList.toggle("is-active", entry.isIntersecting);
          }
        },
        { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
      );
      sections.forEach((s) => observer.observe(s));
    } else {
      // 没有 IntersectionObserver 的降级：直接点亮第一项，
      // 目录仍然可点击跳转，只是不会跟随滚动高亮
      const first = linkFor(sections[0].id);
      if (first) first.classList.add("is-active");
    }
  }

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 从 Work 页 morph 进来的那一秒里不要建 ScrollTrigger：每建一个都要
  // 读一次布局，十几个叠在一起正好卡在进场动画的头几帧上，表现就是
  // 「点开先顿一下再放大」。等 js/case-enter.js 播完发 case:entered 再建
  function whenReady(fn) {
    if (document.documentElement.dataset.caseEnter === "1") {
      window.addEventListener("case:entered", fn, { once: true });
    } else {
      fn();
    }
  }

  if (hasGSAP && !reducedMotion) {
    // 只对 .case-module 这个外层包装做揭示动画，不单独再对它内部的
    // .case-placeholder 重复做一遍——opacity/y 加在父级上，子级
    // （不管是真实媒体还是占位块）本来就会跟着一起动，两层都做
    // 只会让曲线叠加、没有额外视觉效果。
    // .case-module-no-reveal 是给需要自己管理滚动动画（比如内部有
    // ScrollTrigger pin）的模块用的逃生舱：这里留下的 transform（哪怕
    // 是 translate(0,0) 的恒等值）会让它变成 fixed 定位后代的新
    // containing block，破坏 pin 的定位计算，所以这类模块要跳过这层
    // 通用揭示动画，不写在这个 transform 上
    const modules = document.querySelectorAll(".case-module:not(.case-module-no-reveal)");
    // 初始隐藏态必须现在（首帧绘制前，本脚本是 body 末尾的同步脚本）就
    // 定下来，不能等 case:entered——进场时间轴在 0.63s 就会把各 section
    // 的 opacity 揭示为 1，如果模块那时还是 CSS 默认的 opacity:1，
    // Research 的 quote 就会在折叠线附近先闪现一下、再被下面的 fromTo
    // 压回 0。ScrollTrigger 的创建仍然推迟（那才是卡帧的来源），
    // 这里只是把「隐藏」提前
    // 首屏内 / 首屏外分开处理。首屏内的模块（比如折叠线附近的 Research
    // quote）不能等滚动，也不能比所在 section 的标题慢一拍：
    //   · 从 Work 页 morph 进来时：干脆不单独藏它——section 本身在进场
    //     时间轴 0.63s 那次整体淡入里出现，模块跟着同一次淡入露出，
    //     和 RESEARCH 标题严格同帧，不存在「标题先到、正文后补」；
    //   · 直接打开时：藏住后立刻播同一条淡入（whenReady 同步执行）。
    // 首屏外的模块两种路径都一样：先藏，交给原来的滚动 reveal，不变
    const entering = document.documentElement.dataset.caseEnter === "1";
    // 进场期间 Hero 是 position:fixed（脱离文档流），#overview 塌掉了
    // 约一个 Hero 的高度，Hero 之后的所有元素此刻都被量「高」了一截——
    // 不补偿的话 Persona 这类真实在视口外的模块会被误判成视口内、
    // 从而跳过滚动 reveal。Hero 恒为 16:9、宽度等于内容列宽，据此把
    // 塌掉的高度补回去
    let bias = 0;
    if (entering) {
      const content = document.querySelector(".case-content");
      if (content) bias = (content.getBoundingClientRect().width * 9) / 16;
    }
    const inView = [], below = [];
    modules.forEach((el) => {
      const top =
        el.getBoundingClientRect().top +
        (entering && !el.closest("#overview") ? bias : 0);
      (top < window.innerHeight ? inView : below).push(el);
    });
    gsap.set(below, { opacity: 0, y: 22 });
    if (!entering) gsap.set(inView, { opacity: 0, y: 22 });
    whenReady(() => {
      if (!entering) {
        inView.forEach((el) =>
          gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" })
        );
      }
      below.forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 22 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 88%" },
          }
        );
      });
    });
  }
})();

/* ────────────────────────────────────────────────────────────
   结尾退场：整份 case 全部读完之后，当前项目这一整页作为一个
   unified canvas 被「横向推开」，下一个项目从右下角进来接管画面。
   关键是节奏——旧页面先让位 → 新视觉先露头 → 新视觉长大 →
   旧页面才退到背景 → 最后文字才被横向拉开，而不是「滚到底 → 全部
   fade → 下一个项目出现」。

   Y 方向的「停住」交给 CSS 原生 position:sticky + bottom:0（见
   css/case.css）：内容全部滚完才停，触发点天然正确，而且不写
   transform——不能用 ScrollTrigger 的 pin，pin 会在元素上留下
   transform（哪怕恒等值），带 transform 的祖先会成为 position:fixed
   后代的 containing block，把内部 Experience 那段 sticky video 的 pin
   定位彻底算错。停住之后，滚过 .case-ending-spacer 的进度就只用来
   推这条时间轴，页面本身不再纵向移动。

   时间轴（进度 → 动作，各段刻意重叠出连贯感）：
     0.00–0.60  整页只向左移动（不上移、不缩放、不变暗）
     0.28–0.46  下一个项目的 Hero 图在右下角浮现（很小，origin 右下角）
     0.28–0.72  这张图持续放大到最终尺寸
     0.55–0.85  图已经明显存在之后，旧页面才开始变暗（最低 0.3，
                始终在左侧留得住，不会消失）
     0.62–0.86  NEXT UP / 项目名 / 描述 依次被横向拉开（clip-path）
     0.82–1.00  Contact、分隔线、[ VIEW ALL PROJECTS ] 再拉开
   向上滚全程严格逆放（所有值都是进度的纯函数，天然可逆）。
   永不自动跳转，只有点击才会进入下一个 case。

   只在桌面端（>=900px）+ 非 reduced-motion 时启用。所有 case 共用。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const root = document.querySelector("main.case");
  const canvas = document.getElementById("case-page-canvas");
  const spacer = document.getElementById("ending-spacer");
  const ending = document.getElementById("case-next");
  if (!root || !canvas || !spacer || !ending) return;

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isDesktop = () => window.innerWidth >= 900;
  if (!hasGSAP || reducedMotion) return;

  const previewLink = ending.querySelector(".case-ending-preview-link");
  const kicker = ending.querySelector(".case-ending-next .case-kicker");
  const title = ending.querySelector(".case-ending-next-title");
  const tagline = ending.querySelector(".case-ending-next-tagline");
  const rule = ending.querySelector(".case-ending-rule");
  const contact = ending.querySelector(".case-ending-contact");
  const viewAll = ending.querySelector(".case-view-all");
  if (!previewLink) return;

  // 整页最终向左推出的距离（只有 X，没有 Y、没有缩放，页面本身尺寸不变）。
  // -76vw 让旧页面的右边缘停在视口 24% 处——和参考图里旧项目只在左边
  // 露出约四分之一是同一个比例，右侧 26.5% 起的那块新 UI 才有完整空间，
  // 两边不会重叠
  const SHIFT_VW = -76;
  // 旧页面最暗只到这里——明显退到背景层，但不会消失、也不是纯黑，
  // 左边始终隐约看得出是上一张 case study
  const DIM_TO = 0.14;
  const IMG_FROM = 0.42;  // 下一个项目 Hero 图的初始缩放（很小，贴在右下角）

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const range = (p, a, b) => clamp01((p - a) / (b - a));
  const ease = (v) => v * v * (3 - 2 * v);
  // 横向拉开：clip-path 从右边收满（看不见）到完全打开
  const curtain = (v) => "inset(0 " + (100 - 100 * v).toFixed(2) + "% 0 0)";

  const reveals = [kicker, title, tagline, rule, contact, viewAll].filter(Boolean);
  let trigger = null;

  // 回到动效范围之前必须把 transform 彻底清掉，不能留下
  // matrix(1,0,0,1,0,0) 这种恒等值——带 transform 的祖先会成为 fixed
  // 后代的 containing block，弄坏 Experience 那段 pin
  function reset() {
    gsap.set(canvas, { clearProps: "transform,opacity" });
    gsap.set(previewLink, { clearProps: "transform,opacity" });
    reveals.forEach((el) => gsap.set(el, { clearProps: "clipPath" }));
    ending.classList.remove("is-interactive");
  }

  function teardown() {
    if (trigger) {
      trigger.kill();
      trigger = null;
    }
    root.classList.remove("is-ending-scrubbed");
    ending.classList.remove("is-overlay", "is-interactive");
    canvas.style.top = "";
    reset();
  }

  function setup() {
    teardown();
    if (!isDesktop()) return;

    root.classList.add("is-ending-scrubbed");
    ending.classList.add("is-overlay");

    // 高元素的 sticky 要用「负的 top」：元素正常滚动，直到底边和视口
    // 底边对齐就停住。数值必须在这里算——它同时取决于视口高度和
    // canvas 的实际高度（图片/视频尺寸、其它 ScrollTrigger 插入的
    // pin-spacer 都会影响），写死在 CSS 里没法自适应
    canvas.style.top = Math.round(window.innerHeight - canvas.offsetHeight) + "px";

    trigger = ScrollTrigger.create({
      trigger: spacer,
      // spacer 顶边碰到视口底边 = canvas 底边刚好贴住视口底边
      // = 整份 case 已经完整看完，退场从这一刻才开始
      start: "top bottom",
      end: "bottom bottom",
      scrub: true,
      onUpdate(self) {
        const p = self.progress;

        // ① 整页只向左移动，先不变暗
        gsap.set(canvas, {
          x: SHIFT_VW * ease(range(p, 0, 0.6)) + "vw",
          // ④ 图片明显出现之后（0.55）旧页面才开始退到背景
          opacity: 1 - (1 - DIM_TO) * ease(range(p, 0.55, 0.85)),
        });

        // ② 下一个项目的 Hero 图先于任何文字出现：右下角、很小、逐渐长大
        gsap.set(previewLink, {
          opacity: ease(range(p, 0.28, 0.46)),
          scale: IMG_FROM + (1 - IMG_FROM) * ease(range(p, 0.28, 0.72)),
        });

        // ③ 图片已经接近最终尺寸时，文字才被横向拉开（依次）
        gsap.set(kicker, { clipPath: curtain(ease(range(p, 0.62, 0.74))) });
        gsap.set(title, { clipPath: curtain(ease(range(p, 0.66, 0.8))) });
        gsap.set(tagline, { clipPath: curtain(ease(range(p, 0.72, 0.86))) });

        // ④ 次要信息最后拉开
        gsap.set(rule, { clipPath: curtain(ease(range(p, 0.82, 0.92))) });
        gsap.set(contact, { clipPath: curtain(ease(range(p, 0.84, 0.96))) });
        gsap.set(viewAll, { clipPath: curtain(ease(range(p, 0.86, 1))) });

        ending.classList.toggle("is-interactive", p > 0.5);
      },
      onLeaveBack: reset,
    });
  }

  // 等页面稳定（图片/视频尺寸、别的 ScrollTrigger 插入的 pin-spacer
  // 都会改变文档高度）之后再建
  function boot() {
    setup();
    ScrollTrigger.refresh();
  }
  function armBoot() {
    if (document.readyState === "complete") boot();
    else window.addEventListener("load", boot, { once: true });
  }
  // 从 Work 页 morph 进来时，window load（~200ms）落在进场动画中段——
  // 那一刻 Experience 的视频 src 还被 case-enter.js 按着（pin 未建、
  // 文档短 1920px）、各 section 还有 contain-intrinsic-size 的占位高度，
  // 这时候算出来的触发点和 sticky top 全是错的，正是「第一次进入滚到
  // Experience 就跳去 Ending、刷新一次才正常」的根源。等 case:entered
  // （进场收尾、媒体放行之后）再 boot
  if (document.documentElement.dataset.caseEnter === "1") {
    window.addEventListener("case:entered", armBoot, { once: true });
  } else {
    armBoot();
  }

  // 文档在 boot 之后还会长高：Experience 的 pin-spacer 要等它的视频
  // metadata 到了才插入（首次进入时被推迟到进场结束后），lazy 图片也
  // 陆续解码。触发点靠 ScrollTrigger.refresh 重算，但 sticky 的负 top
  // 是 setup 里写死的 inline 值，refresh 不会碰它——挂在 refreshInit 上
  // 跟着每次 refresh 一起重算，冻结点才始终对准「内容真正读完」的位置
  ScrollTrigger.addEventListener("refreshInit", () => {
    if (root.classList.contains("is-ending-scrubbed")) {
      canvas.style.top = Math.round(window.innerHeight - canvas.offsetHeight) + "px";
    }
  });

  // 某个 case 专属脚本（比如 Duolingo 的 Experience）在 boot 之后才创建
  // 了新的 pin 时会广播这个事件。ScrollTrigger 对「上方 pin 撑高的距离」
  // 的补偿只认创建顺序，refresh 是补不回来的——唯一的办法是把结尾这个
  // trigger 拆掉重建，让它的创建顺序排到新 pin 之后，触发点才会真正
  // 落在全部内容（含 pin 行程）之后
  window.addEventListener("case:pins-changed", () => {
    if (!trigger) return; // 还没 boot：等 boot 时创建，顺序天然在 pin 之后
    setup();
    ScrollTrigger.refresh();
  });

  // 页面里的图片是 loading="lazy" 的，会在 load 事件之后才陆续解码完成，
  // 每解一张文档就长高一点。这个退场的触发点算的是「整份 case 的底边
  // 碰到视口底边」，直接依赖最终高度——不跟着重算的话，触发点会停留在
  // 页面还没长全时的旧位置，退场就会在 Campaign 还没看完时提前开始。
  // 用 debounce 合并成一次，避免十几张图各触发一次 refresh
  let imgTimer;
  document.querySelectorAll("img").forEach((img) => {
    if (img.complete) return;
    img.addEventListener(
      "load",
      () => {
        clearTimeout(imgTimer);
        imgTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
      },
      { once: true }
    );
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 200);
  });
})();
