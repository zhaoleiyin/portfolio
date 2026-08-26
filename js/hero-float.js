/* ────────────────────────────────────────────────────────────
   漂浮贴纸：JS 驱动的翻滚飘落（Web Animations API，合成器执行）

   · 首批按顺序逐个登场（间隔随机），不会一批同时出现
   · 每轮落完后从新的随机水平位置重生，参数全部重新随机：
     下落时长 / 摇摆幅度与相位 / 翻转圈数与方向 / 重生间隔
   · prefers-reduced-motion → 不启动（CSS 已隐藏整层）
   ──────────────────────────────────────────────────────────── */
(() => {
  "use strict";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const els = [...document.querySelectorAll(".hero-float .fl")];
  if (!els.length) return;

  const layerBack = document.querySelector(".hero-float-back");
  const layerFront = document.querySelector(".hero-float-front");

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function cycle(el) {
    const img = el.querySelector("img");

    /* ── 每轮随机生成一条弧线轨迹 ──
       startX 可以在画框边缘外侧（半探出来进场）
       drift  横向总位移：一半概率轻微斜落、一半概率大幅斜飘（会从侧边出画）
       arcExp 弧线形状：>1 先竖后弯（抛物线甩出去），<1 先斜后直 */
    /* 每轮随机决定这次飘在前景还是背景（前 40%），
       在前略放大、在后略缩小——像落叶忽近忽远 */
    if (layerBack && layerFront) {
      const front = Math.random() < 0.4;
      (front ? layerFront : layerBack).appendChild(el);
      el.style.setProperty("--sizeScale", (front ? rand(1.05, 1.25) : rand(0.82, 1.0)).toFixed(2));
    }

    el.style.left = rand(-8, 96).toFixed(1) + "%";
    /* 缓慢下落，快慢仍有差（散开用） */
    const dur = rand(20, 50) * 1000;
    const gentle = Math.random() < 0.5;
    const drift =
      (gentle ? rand(5, 14) : rand(25, 55)) * pick([-1, 1]) * innerWidth / 100;
    const arcExp = rand(0.7, 2.4);
    const sway = rand(8, 20);
    const swayCycles = rand(1.5, 3);
    const phase = rand(0, Math.PI * 2);

    /* 弧线 + 正弦微摆，烘焙成关键帧轨迹 */
    const STEPS = 14;
    const frames = [];
    for (let i = 0; i <= STEPS; i++) {
      const p = i / STEPS;
      const x = drift * Math.pow(p, arcExp) + Math.sin(phase + p * 6.2832 * swayCycles) * sway;
      frames.push({
        offset: p,
        easing: "linear",
        transform: `translate(${x.toFixed(1)}px, ${(p * 155).toFixed(2)}vh)`,
      });
    }
    const fall = el.animate(frames, { duration: dur, easing: "linear" });

    /* 平面翻转：随机圈数与方向 */
    const turns = pick([-2, -1.5, -1, 1, 1.5, 2]);
    img.animate(
      [{ transform: "rotate(0deg)" }, { transform: `rotate(${turns * 360}deg)` }],
      { duration: dur, easing: "linear" }
    );

    /* 出画后停一段（更宽的随机区间，进一步错开节奏），换位置换弧线再来 */
    fall.onfinish = () => setTimeout(() => cycle(el), rand(800, 9000));
  }

  /* 首批：按顺序逐个进场（参考 haoqi 的节奏） */
  let t = 600;
  for (const el of els) {
    el.style.visibility = "hidden";
    setTimeout(() => {
      el.style.visibility = "visible";
      cycle(el);
    }, t);
    t += rand(1800, 3600);
  }
})();
