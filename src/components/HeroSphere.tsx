// ============================================================
// 首页 Hero 右侧焦点：中心黑洞球 + 6 圈粒子环 + 高光斑公转
// 设计：背景的宇宙星空由 CosmicBackground（铺满整页）提供，
//      本组件只渲染焦点构图，让黑洞球成为"浩瀚宇宙中的引力中心"。
//   - 6 圈椭圆粒子环（不同 rx/ry/dasharray+stroke-dashoffset 动画）
//   - 中心球体 3D 渐变 + 边缘橙色描边
//   - 高光斑绕球公转（"球面持续转动"）
//   - 光子环（Einstein ring，极薄的橙色椭圆+模糊）
//   全部纯 SVG + CSS，零外部依赖。
// ============================================================

const W = 900;
const H = 700;
const CX = 450;
const CY = 350;
const SR = 52;

// 绕球公转的小尘埃（14 颗，焦点周围"物质环绕"的感觉）
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}
const DUST = (() => {
  const r = lcg(99);
  const out = [];
  for (let i = 0; i < 14; i++) {
    const angle = r() * Math.PI * 2;
    const radius = 70 + r() * 200;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    const dotR = 0.8 + r() * 1.4;
    const o = 0.4 + r() * 0.5;
    const dur = 6 + r() * 10;
    const delay = r() * 3;
    const reverse = r() < 0.5;
    out.push({ dx, dy, r: dotR, o, dur, delay, reverse });
  }
  return out;
})();

export function HeroSphere({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`hero-sphere ${className}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="中心黑洞球与粒子环焦点"
    >
      <defs>
        {/* 背景大辉光 */}
        <radialGradient id="hs-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF7A1A" stopOpacity="0.4" />
          <stop offset="45%" stopColor="#FF7A1A" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#FF7A1A" stopOpacity="0" />
        </radialGradient>

        {/* 球体 3D 渐变（高光偏左上 → 球体偏暗） */}
        <radialGradient id="hs-sphere" cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#3a261a" />
          <stop offset="30%" stopColor="#161009" />
          <stop offset="70%" stopColor="#070503" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>

        {/* 高光斑渐变 */}
        <radialGradient id="hs-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ffb070" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ff8030" stopOpacity="0" />
        </radialGradient>

        {/* 球周橙色光晕 */}
        <radialGradient id="hs-rim" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#FF7A1A" stopOpacity="0" />
          <stop offset="85%" stopColor="#FF7A1A" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FF7A1A" stopOpacity="0" />
        </radialGradient>

        {/* 光子环模糊 */}
        <filter id="hs-blur"><feGaussianBlur stdDeviation="2.5" /></filter>
      </defs>

      {/* 背景辉光 */}
      <circle cx={CX} cy={CY} r="380" fill="url(#hs-glow)" className="hs-halo" />

      {/* 6 圈主粒子环 —— 吸积盘 */}
      <g
        fill="none"
        stroke="#FF7A1A"
        strokeLinecap="round"
        className="hs-rings"
      >
        <ellipse cx={CX} cy={CY} rx="420" ry="150" strokeWidth="1.2" strokeDasharray="3 8"  opacity="0.7" className="hs-ring hs-ring-1" />
        <ellipse cx={CX} cy={CY} rx="380" ry="135" strokeWidth="1"   strokeDasharray="5 6"  opacity="0.75" className="hs-ring hs-ring-2" transform={`rotate(15 ${CX} ${CY})`} />
        <ellipse cx={CX} cy={CY} rx="320" ry="115" strokeWidth="1.4" strokeDasharray="2 4"  opacity="0.85" className="hs-ring hs-ring-3" transform={`rotate(-10 ${CX} ${CY})`} />
        <ellipse cx={CX} cy={CY} rx="280" ry="100" strokeWidth="1"   strokeDasharray="6 12" opacity="0.7"  className="hs-ring hs-ring-4" transform={`rotate(8 ${CX} ${CY})`} />
        <ellipse cx={CX} cy={CY} rx="230" ry="82"  strokeWidth="1.6" strokeDasharray="1 3"  opacity="0.95" className="hs-ring hs-ring-5" transform={`rotate(-5 ${CX} ${CY})`} />
        <ellipse cx={CX} cy={CY} rx="180" ry="65"  strokeWidth="1"   strokeDasharray="4 5"  opacity="0.8"  className="hs-ring hs-ring-6" transform={`rotate(20 ${CX} ${CY})`} />
      </g>

      {/* 光子环（Einstein ring）—— 引力透镜效果 */}
      <ellipse
        cx={CX}
        cy={CY}
        rx={SR + 12}
        ry={(SR + 12) * 0.42}
        fill="none"
        stroke="#FF7A1A"
        strokeWidth="1.2"
        opacity="0.6"
        filter="url(#hs-blur)"
      />
      <ellipse
        cx={CX}
        cy={CY}
        rx={SR + 6}
        ry={(SR + 6) * 0.42}
        fill="none"
        stroke="#FFb070"
        strokeWidth="0.8"
        opacity="0.85"
      />

      {/* 球周橙色光晕 */}
      <circle cx={CX} cy={CY} r={SR + 18} fill="url(#hs-rim)" className="hs-sphere-halo" />

      {/* 绕球公转的小尘埃 */}
      <g className="hs-dust">
        {DUST.map((d, i) => (
          <circle
            key={i}
            cx={CX + d.dx}
            cy={CY + d.dy}
            r={d.r}
            fill="#FFB070"
            opacity={d.o}
            className={`hs-dust-particle ${d.reverse ? 'hs-dust-rev' : ''}`}
            style={{
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
            }}
          />
        ))}
      </g>

      {/* 中心黑洞球 + 边缘描边 */}
      <circle cx={CX} cy={CY} r={SR} fill="url(#hs-sphere)" stroke="#FF7A1A" strokeWidth="1" strokeOpacity="0.7" />

      {/* 高光斑：绕球公转（"球面在转"） */}
      <ellipse cx={CX - 16} cy={CY - 22} rx="14" ry="9" fill="url(#hs-spec)" className="hs-spec" />
    </svg>
  );
}
