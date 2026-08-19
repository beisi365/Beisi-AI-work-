// ============================================================
// 全屏宇宙背景（铺满整个首页 / 登录页）
//   - 180 颗确定性星空（30% 闪烁 / 12% 暖橙散点）
//   - 5 处大尺度星云（暖橙/深红/淡橙层层纵深）
//   - 3 圈远景视差环 + 30 颗远景尘埃
//   - 整体极慢漂移（80s 一次），让宇宙"缓缓移动"
//   - viewBox 1600x1000 + preserveAspectRatio xMidYMid slice：
//     不同视口大小自动适配，星点位置跨刷新一致、不抖动
//   - 调用方请用 position:fixed; inset:0; pointer-events:none 包裹
//   纯 SVG + CSS，零依赖。
// ============================================================

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const W = 1600;
const H = 1000;

// 180 颗星光（铺满整页）
const STARS = (() => {
  const r = lcg(4242);
  const stars = [];
  for (let i = 0; i < 180; i++) {
    const x = r() * W;
    const y = r() * H;
    const radius = 0.4 + r() * 1.6;
    const o = 0.25 + r() * 0.7;
    const isAccent = r() < 0.12;
    const twinkle = r() < 0.3;
    const dur = 2 + r() * 5;
    const delay = r() * 4;
    stars.push({ x, y, r: radius, o, color: isAccent ? '#FFaa66' : '#ffffff', twinkle, dur, delay });
  }
  return stars;
})();

// 5 处深空星云（椭圆 + 径向渐变 + 高斯模糊）——坐标铺满全页
const NEBULAS = [
  { id: 'cb-neb-1', cx: 260, cy: 280, rx: 480, ry: 320, color: '#FF6a00', opacity: 0.28, blur: 38 },
  { id: 'cb-neb-2', cx: 1280, cy: 720, rx: 520, ry: 360, color: '#8a1f00', opacity: 0.24, blur: 42 },
  { id: 'cb-neb-3', cx: 920, cy: 180, rx: 360, ry: 240, color: '#ff9966', opacity: 0.16, blur: 30 },
  { id: 'cb-neb-4', cx: 140, cy: 820, rx: 420, ry: 280, color: '#5a1600', opacity: 0.2, blur: 35 },
  { id: 'cb-neb-5', cx: 1500, cy: 120, rx: 320, ry: 200, color: '#c44a16', opacity: 0.18, blur: 28 },
];

// 3 圈远景视差环（极淡，营造"远景"层级）
const FAR_RINGS = [
  { id: 'cb-ring-1', cx: 800, cy: 500, rx: 720, ry: 220, dash: '6 18', opacity: 0.22, dur: 90 },
  { id: 'cb-ring-2', cx: 800, cy: 500, rx: 900, ry: 280, dash: '4 22', opacity: 0.16, dur: 120 },
  { id: 'cb-ring-3', cx: 800, cy: 500, rx: 1100, ry: 340, dash: '3 26', opacity: 0.12, dur: 150 },
];

// 30 颗远景尘埃（绕整页中心公转，极慢，营造"宇宙尘埃弥漫"）
const FAR_DUST = (() => {
  const r = lcg(7777);
  const out = [];
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2 + r() * 0.1;
    const dist = 200 + r() * 600;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.5; // 压扁 →更像盘旋而非球面公转
    const dotR = 0.6 + r() * 1.0;
    const o = 0.3 + r() * 0.4;
    const dur = 40 + r() * 50;
    const delay = r() * 5;
    const reverse = r() < 0.5;
    out.push({ dx, dy, r: dotR, o, dur, delay, reverse });
  }
  return out;
})();

export function CosmicBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`cosmic-bg ${className}`} aria-hidden="true">
      <svg
        className="cosmic-bg-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <defs>
          {NEBULAS.map((n) => (
            <radialGradient key={n.id} id={n.id} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={n.color} stopOpacity={n.opacity} />
              <stop offset="50%" stopColor={n.color} stopOpacity={n.opacity * 0.5} />
              <stop offset="100%" stopColor={n.color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {/* 底层辉光（最底色，避免纯黑太死） */}
        <rect x="0" y="0" width={W} height={H} fill="#0a0612" />

        {/* 星云 */}
        <g className="cb-nebulas">
          {NEBULAS.map((n) => (
            <ellipse
              key={n.id}
              cx={n.cx}
              cy={n.cy}
              rx={n.rx}
              ry={n.ry}
              fill={`url(#${n.id})`}
              filter={`blur(${n.blur})`}
            />
          ))}
        </g>

        {/* 远景视差环 */}
        <g className="cb-far-rings">
          {FAR_RINGS.map((ring) => (
            <ellipse
              key={ring.id}
              cx={ring.cx}
              cy={ring.cy}
              rx={ring.rx}
              ry={ring.ry}
              fill="none"
              stroke="#FF7A1A"
              strokeWidth="0.8"
              strokeDasharray={ring.dash}
              opacity={ring.opacity}
              className={`cb-far-ring cb-far-ring-${ring.dur}`}
              style={{ animationDuration: `${ring.dur}s` }}
            />
          ))}
        </g>

        {/* 远景尘埃 */}
        <g className="cb-dust">
          {FAR_DUST.map((d, i) => (
            <circle
              key={i}
              cx={800 + d.dx}
              cy={500 + d.dy}
              r={d.r}
              fill="#FF7A1A"
              opacity={d.o}
              className={`cb-dust-particle ${d.reverse ? 'cb-dust-rev' : ''}`}
              style={{
                animationDuration: `${d.dur}s`,
                animationDelay: `${d.delay}s`,
                transformOrigin: '800px 500px',
              }}
            />
          ))}
        </g>

        {/* 星空星点 */}
        <g className="cb-stars">
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill={s.color}
              opacity={s.o}
              className={s.twinkle ? 'cb-twinkle' : ''}
              style={
                s.twinkle
                  ? { animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }
                  : undefined
              }
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
