(() => {
  "use strict";

  const cursorEl = document.getElementById("work-cursor");
  const mediaEls = Array.from(document.querySelectorAll(".work-media"));
  if (!cursorEl || !mediaEls.length) return;

  const hasGSAP = !!window.gsap;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = matchMedia("(hover: none), (pointer: coarse)").matches;
  // 触屏 / 无 GSAP / 用户偏好静态：直接跳过，保留原生链接点击，不装配自定义光标
  if (!hasGSAP || reducedMotion || coarsePointer) return;

  const armL = cursorEl.querySelector(".wc-arm-l");
  const armR = cursorEl.querySelector(".wc-arm-r");

  const setX = gsap.quickTo(cursorEl, "x", { duration: 0.35, ease: "power3.out" });
  const setY = gsap.quickTo(cursorEl, "y", { duration: 0.35, ease: "power3.out" });

  gsap.set(cursorEl, { x: -100, y: -100, opacity: 0 });

  let activeEl = null;

  function onMove(e) {
    setX(e.clientX);
    setY(e.clientY);
  }

  function show(el, e) {
    activeEl = el;
    setX(e.clientX);
    setY(e.clientY);
    document.addEventListener("mousemove", onMove);
    el.style.cursor = "none";
    // 注意：这里不能用 overwrite:true——它会把刚触发的 x/y quickTo 跟随动画也杀掉
    gsap.to(cursorEl, { opacity: 1, duration: 0.25, ease: "power2.out" });
  }

  function hide(el) {
    if (activeEl !== el) return;
    activeEl = null;
    document.removeEventListener("mousemove", onMove);
    el.style.cursor = "";
    gsap.to(cursorEl, { opacity: 0, duration: 0.22, ease: "power2.out" });
    gsap.to([armL, armR], { rotate: 0, duration: 0.3, ease: "power2.out" });
  }

  function press() {
    gsap.to(armL, { rotate: 12, duration: 0.16, ease: "power2.out", overwrite: true });
    gsap.to(armR, { rotate: -12, duration: 0.16, ease: "power2.out", overwrite: true });
  }

  function release() {
    gsap.to([armL, armR], { rotate: 0, duration: 0.4, ease: "elastic.out(1, 0.5)", overwrite: true });
  }

  mediaEls.forEach((el) => {
    el.addEventListener("mouseenter", (e) => show(el, e));
    el.addEventListener("mouseleave", () => hide(el));
    el.addEventListener("mousedown", press);
    el.addEventListener("mouseup", release);
    el.addEventListener("click", (e) => {
      const href = el.getAttribute("href");
      if (!href || href === "#") { e.preventDefault(); return; }
      e.preventDefault();
      release();
      gsap.delayedCall(0.3, () => { window.location.href = href; });
    });
  });
})();
