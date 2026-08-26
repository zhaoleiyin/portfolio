/* ────────────────────────────────────────────────────────────
   Step Inside Tomorrow — Research 的滚动揭示。

   这一段没有图片，视觉主体就是「正在被读出来的数据」——和后面
   Experience / Campaign 的大量图片形成节奏差异。顺序严格是：

     TARGET AUDIENCE → card 01 + 0→63% → card 02 + 0→75% →
     card 03 + 0→47% → The barrier is getting smaller. →
     COST ↓ → ACCESS ↑ → ADOPTION ↑ → 落点那一行

   顺序就是叙事本身：先交代对象，再摆证据，最后一行从人回到那个
   design opportunity；Experience 的开场再接在它后面（见文件末尾
   的接力）。

   数字不是普通的 count up：先有 0.4 秒左右的「读数跳动」（像终端
   在扫数据），再快速数到最终值并锁定。这一下是为了呼应 CBS /
   新闻 / 数据 / prediction，不是为了动画而动画，所以只给数字、
   只给这一次，其它元素都是最克制的 fade + 位移。
   没用 GSAP 的 ScrambleTextPlugin：那是 Club 插件，而且它按字符
   打乱、更适合文本；这里要的是「整个读数在跳」，自己写反而更准，
   也少加载一份脚本。

   ScrollTrigger 只做触发（once），不 pin、不 scrub——用户滚一次
   就能看完整段，不需要反复滚。
   prefers-reduced-motion 或没有 GSAP 时：整段就是 CSS 默认的静态
   最终态，数字本来就写在 HTML 里，什么都不用补。
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const section = document.getElementById("research");
  if (!section) return;

  const audience = Array.from(
    section.querySelectorAll(".sit-audience > *")
  );
  const cards = Array.from(section.querySelectorAll(".sit-stat"));
  const line = section.querySelector(".sit-barrier-line");
  const tags = Array.from(section.querySelectorAll(".sit-barrier-tags span"));
  const insight = section.querySelector(".sit-insight-line");
  const expSection = document.getElementById("experience");

  /* ── 02 Understand 那段 AI avatar 视频的声音开关 ──
     默认静音（喇叭是关闭态），只有用户点击才出声；再点回到静音。
     不依赖 GSAP，也不受 reduced-motion 影响——它是功能不是动画，
     所以放在下面那些提前 return 之前 */
  const sndBtn = document.getElementById("sit-avatar-sound");
  const sndVid = document.getElementById("sit-avatar-video");
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

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 降级路径：HTML 里本来就是最终态（63% / 75% / 47% 都是写死的
  // 文本），不藏、不动，直接就是对的
  if (!hasGSAP || reducedMotion) return;

  // 和 case.js 同一个约定：从 Work 页 morph 进来的那一秒里不建
  // ScrollTrigger（每建一个都要读一次布局，会卡在进场动画的头几帧上）
  function whenReady(fn) {
    if (document.documentElement.dataset.caseEnter === "1") {
      window.addEventListener("case:entered", fn, { once: true });
    } else {
      fn();
    }
  }

  /* ── 数字：读数跳动 → 快速数到最终值 → 锁定 ──
     最终值直接从 HTML 里的文本读（"63%" → 63），不额外挂 data 属性：
     这样没有 JS 的时候页面上写的就已经是正确答案 */
  function scanThenCount(el) {
    const target = parseInt(el.textContent, 10) || 0;
    const state = { t: 0, v: 0 };
    let lastStep = -1;

    const tl = gsap.timeline();
    // 1) data scan：每 ~90ms 换一个随机读数，不是每帧乱闪（每帧换
    //    看起来是噪点，不是仪器在读数）
    tl.to(state, {
      t: 1,
      duration: 0.42,
      ease: "none",
      onUpdate() {
        const step = Math.floor(state.t / 0.11);
        if (step === lastStep) return;
        lastStep = step;
        el.textContent = 12 + Math.floor(Math.random() * 87) + "%";
      },
    });
    // 2) 锁定：从 0 平滑数到真实值，末尾 onComplete 精确写回目标值
    //    （避免四舍五入停在 62%）
    tl.fromTo(
      state,
      { v: 0 },
      {
        v: target,
        duration: 0.5,
        ease: "power2.out",
        // fromTo 默认会立刻渲染起始值，那会在动画开始前就把页面上的
        // "63%" 改写成 "0%"——真实数字必须一直留在 DOM 里，直到读数
        // 动画真的开始
        immediateRender: false,
        onUpdate() {
          el.textContent = Math.round(state.v) + "%";
        },
        onComplete() {
          el.textContent = target + "%";
        },
      }
    );
    return tl;
  }

  whenReady(() => {
    // 初始态：整段先藏起来，等 ScrollTrigger 触发
    gsap.set(audience, { opacity: 0, y: 14 });
    gsap.set(cards, { opacity: 0, y: 20, scale: 0.98 });
    cards.forEach((c) => {
      const cap = c.querySelector(".sit-stat-cap");
      if (cap) gsap.set(cap, { opacity: 0 });
    });
    if (line) gsap.set(line, { opacity: 0, y: 12 });
    gsap.set(tags, { opacity: 0 });
    if (insight) gsap.set(insight, { opacity: 0, y: 12 });

    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: "power2.out" },
    });

    // 1) Target Audience：先交代读者是谁
    if (audience.length) {
      tl.to(audience, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.1,
      });
    }

    // 2+3) 三张卡从左到右依次落位，每张落位后紧跟自己的读数动画，
    //      读数锁定后它下面那行说明再淡进来
    const dataAt = audience.length ? 0.5 : 0;
    cards.forEach((card, i) => {
      // 0.13s 的 stagger 写成显式的时间点，好让每张卡的数字/说明
      // 都挂在自己这一拍上，而不是三组动画各自算偏移
      const at = dataAt + i * 0.13;
      tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.55 }, at);

      const num = card.querySelector(".sit-stat-num");
      const cap = card.querySelector(".sit-stat-cap");
      if (num) tl.add(scanThenCount(num), at + 0.16);
      // 读数总长 0.42 + 0.5 = 0.92s，说明文字压在它锁定之后
      if (cap) tl.to(cap, { opacity: 1, duration: 0.45 }, at + 1.02);
    });

    // 4) Barrier：证据之后才是结论主句
    if (line) tl.to(line, { opacity: 1, y: 0, duration: 0.5 }, ">-0.15");
    // 5) 三个趋势依次亮起，不是同时出现
    if (tags.length) {
      tl.to(tags, { opacity: 1, duration: 0.4, stagger: 0.14 }, "<+0.15");
    }
    // 6) 落点那一行：从数据回到人，再落到那个问句，最后才出现
    if (insight) {
      tl.to(insight, { opacity: 1, y: 0, duration: 0.55 }, ">-0.05");
    }

    /* 触发器挂在整个 section 上，不挂第一张卡：卡片被 gsap 设成
       opacity:0 之后仍然占位，但把 trigger 绑在一个自己正在动的
       元素上，ScrollTrigger 每次 refresh 都要重新量它——挂在
       section 这个不参与动画的容器上更稳。
       once:true = 播一次就够，不 pin、不 scrub，用户滚一次看完 */
    ScrollTrigger.create({
      trigger: section,
      start: "top 72%",
      once: true,
      onEnter: () => tl.play(),
    });

    /* ── Experience 的开场接在 Research 之后 ──
       Research 现在很短，和 Experience 常常同屏；而 kicker / 引言
       这两样根本不是 .case-module，模板的通用揭示管不到它们，所以
       之前是「Research 还在数数，Experience 的标题已经摆在那儿」。
       这里把开场（EXPERIENCE 标签 + 第一章 EXPLORE 的整块）自己
       管起来，等 Research 讲完再依次出现。后两章走模板的通用滚动
       揭示，不需要单独编排。
       另加一个自己的 ScrollTrigger 兜底：用户点侧栏目录直接跳到
       Experience 时，Research 的时间轴可能还没播，不能让这一段
       永远藏着 */
    const explore = document.getElementById("sit-exp-explore");
    const expIntro = [
      expSection && expSection.querySelector(".case-kicker"),
      explore && explore.querySelector(".sit-ch-label"),
      explore && explore.querySelector(".sit-ch-line"),
      explore && explore.querySelector(".sit-ch-lead"),
      explore && explore.querySelector(".sit-ch-row-2"),
    ].filter(Boolean);

    if (expIntro.length) {
      gsap.set(expIntro, { opacity: 0, y: 16 });
      const expTl = gsap.timeline({ paused: true });
      expTl.to(expIntro, {
        opacity: 1,
        y: 0,
        duration: 0.55,
        ease: "power2.out",
        stagger: 0.12,
      });

      const playExp = () => expTl.play();
      tl.eventCallback("onComplete", playExp);
      ScrollTrigger.create({
        trigger: expSection,
        start: "top 60%",
        once: true,
        onEnter: () => {
          // 这个兜底不能抢在 Research 前面：Research 很短，两段常常
          // 同屏，它的 start 线经常和 Research 的在同一帧越过。
          //   · Research 已经整个滚过去了（或已播完）→ 用户跳过了它，
          //     Experience 不该再干等，直接放行；
          //   · 否则只是确保 Research 在播，播完由 onComplete 接力。
          const r = section.getBoundingClientRect();
          if (r.bottom < 0 || tl.progress() === 1) playExp();
          else tl.play();
        },
      });
    }
  });
})();
