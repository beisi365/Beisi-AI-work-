// ============================================================
// 首页 Hero 装饰：宇宙星空 + 中心黑洞球 + 多圈粒子环
// 设计目标：宇宙星空浩瀚无垠的直观感受——
//   - 深空底色 + 散落星点（120 颗，30% 闪烁，12% 暖橙）
//   - 2-3 处大尺度橙色星云（提供色彩纵深）
//   - 远景视差环 + 主粒子环 + 尘埃粒子（多层空间感）
//   - 中心黑洞球 + 引力透镜光子环 + 高光斑公转
//   全部纯 SVG + CSS 动画，零外部依赖。
// ============================================================

// 确定性 LCG 伪随机：保证星点/尘埃位置跨刷新一致
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const W = 900;
const H = 700;
const CX = 450;
const CY = 350;
const SR = 52;

// 星空：120 颗星点，30% 闪烁，12% 暖橙色调
const STARS = (() => {
  const r = lcg(1337);
  const stars = [];
  for (let i = 0; i < 120; i++) {
    const x = r() * W;
    const y = r() * H;
    const radius = 0.4 + r() * 1.8;
    const o = 0.25 + r() * 0.7;
    const isAccent = r() < 0.12;
    const twinkle = r() < 0.3;
    const dur = 2 + r() * 4;
    const delay = r() * 3;
    stars.push({
      x,
      y,
      r: radius,
      o,
      color: isAccent ? '#FFaa66' : '#ffffff',
      twinkle,
      dur,
      delay,
    });
  }
  return stars;
})();

// 尘埃粒子：14 颗小亮点绕球公转（50/50 正反向）
const DUST = (() => {
  const r = lcg(99);
  const dust = [];
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
    dust.push({ dx, dy, r: dotR, o, dur, delay, reverse });
  }
  return dust;
})();

export function HeroSphere({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`hero-sphere ${className}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="宇宙星空动画：中心黑洞球与环绕粒子"
    >
      <defs>
        {/* 背景大辉光 */}
        <radialGradient id="hs-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF7A1A" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#FF7A1A" stopOpacity="0.08" />
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
          <stop offset="85%" stopColor="#FF7A1A" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FF7A1A" stopOpacity="0" />
        </radialGradient>

        {/* 星云：暖橙 + 深红 + 淡橙，三层色彩纵深 */}
        <radialGradient id="hs-nebula-warm" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF6a20" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FF6a20" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hs-nebula-deep" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c84020" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#c84020" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hs-nebula-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff9050" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ff9050" stopOpacity="0" />
        </radialGradient>

        <filter id="hs-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="hs-blur-sm">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id="hs-blur-lg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="40" />
        </filter>
      </defs>

      {/* —— Layer 1：深空星云（大尺度色彩纵深） —— */}
      <g className="hs-nebula">
        <circle
          cx={CX + 230}
          cy={CY - 180}
          r="280"
          fill="url(#hs-nebula-warm)"
          filter="url(#hs-blur-lg)"
          opacity="0.55"
        />
        <circle
          cx={CX - 280}
          cy={CY + 200}
          r="240"
          fill="url(#hs-nebula-deep)"
          filter="url(#hs-blur-lg)"
          opacity="0.45"
        />
        <circle
          cx={CX + 80}
          cy={CY + 250}
          r="180"
          fill="url(#hs-nebula-glow)"
          filter="url(#hs-blur-lg)"
          opacity="0.4"
        />
      </g>

      {/* —— Layer 2：星空（120 颗，30% 闪烁，12% 暖橙） —— */}
      <g className="hs-stars">
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.color}
            opacity={s.o}
            className={s.twinkle ? 'hs-star-tw' : ''}
            style={
              s.twinkle
                ? { animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }
                : undefined
            }
          />
        ))}
      </g>

      {/* —— Layer 3：远景视差环（极淡，仅作为深度暗示） —— */}
      <g className="hs-rings-distant">
        <ellipse
          className="hs-ring hs-ring-d1"
          cx={CX}
          cy={CY}
          rx="430"
          ry="68"
          fill="none"
          stroke="#FF7A1A"
          strokeWidth="0.7"
          strokeDasharray="1 22"
          opacity="0.22"
        />
        <ellipse
          className="hs-ring hs-ring-d2"
          cx={CX}
          cy={CY}
          rx="480"
          ry="46"
          fill="none"
          stroke="#ff8030"
          strokeWidth="0.6"
          strokeDasharray="1 28"
          opacity="0.18"
        />
      </g>

      {/* —— Layer 4：主粒子环（6 圈，吸积盘效果） —— */}
      <g className="hs-rings">
        <ellipse
          className="hs-ring hs-ring-1"
          cx={CX}
          cy={CY}
          rx="355"
          ry="48"
          fill="none"
          stroke="#FF7A1A"
          strokeWidth="1.6"
          strokeDasharray="3 8"
          opacity="0.75"
        />
        <ellipse
          className="hs-ring hs-ring-2"
          cx={CX}
          cy={CY}
          rx="305"
          ry="80"
          fill="none"
          stroke="#ff8030"
          strokeWidth="1.3"
          strokeDasharray="2 10"
          opacity="0.6"
        />
        <ellipse
          className="hs-ring hs-ring-3"
          cx={CX}
          cy={CY}
          rx="240"
          ry="32"
          fill="none"
          stroke="#e85a20"
          strokeWidth="1.7"
          strokeDasharray="4 6"
          opacity="0.85"
        />
        <ellipse
          className="hs-ring hs-ring-4"
          cx={CX}
          cy={CY}
          rx="190"
          ry="60"
          fill="none"
          stroke="#FF7A1A"
          strokeWidth="1.1"
          strokeDasharray="2 14"
          opacity="0.55"
        />
        <ellipse
          className="hs-ring hs-ring-5"
          cx={CX}
          cy={CY}
          rx="140"
          ry="24"
          fill="none"
          stroke="#ffa050"
          strokeWidth="1.4"
          strokeDasharray="3 5"
          opacity="0.7"
        />
        <ellipse
          className="hs-ring hs-ring-6"
          cx={CX}
          cy={CY}
          rx="98"
          ry="15"
          fill="none"
          stroke="#ff6020"
          strokeWidth="1.2"
          strokeDasharray="2 4"
          opacity="0.6"
        />
      </g>

      {/* —— Layer 5：尘埃粒子（绕球公转，14 颗，50/50 正反向） —— */}
      <g className="hs-dust">
        {DUST.map((p, i) => (
          <circle
            key={i}
            cx={CX + p.dx}
            cy={CY + p.dy}
            r={p.r}
            fill="#ffd9a0"
            opacity={p.o}
            className="hs-dust-particle"
            style={{
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              animationDirection: p.reverse ? 'reverse' : 'normal',
            }}
          />
        ))}
      </g>

      {/* —— Layer 6：中心黑洞球 + 引力透镜光子环 + 高光公转 —— */}
      <g className="hs-sphere-group">
        {/* 球周光晕呼吸 */}
        <circle
          className="hs-sphere-halo"
          cx={CX}
          cy={CY}
          r="75"
          fill="url(#hs-rim)"
          filter="url(#hs-blur)"
        />
        {/* 引力透镜光子环（黑洞标志性视觉） */}
        <ellipse
          cx={CX}
          cy={CY}
          rx={SR + 5}
          ry={SR - 2}
          fill="none"
          stroke="#FF9a4d"
          strokeWidth="0.9"
          opacity="0.7"
          filter="url(#hs-blur-sm)"
        />
        {/* 球体 */}
        <circle cx={CX} cy={CY} r={SR} fill="url(#hs-sphere)" />
        {/* 球体边缘高光环 */}
        <circle
          cx={CX}
          cy={CY}
          r={SR}
          fill="none"
          stroke="#FF7A1A"
          strokeWidth="0.9"
          opacity="0.55"
        />
        {/* 高光斑绕球公转（"球面在转"的视觉感） */}
        <ellipse
          className="hs-spec"
          cx={CX}
          cy={CY - SR + 12}
          rx="9"
          ry="11"
          fill="url(#hs-spec)"
          filter="url(#hs-blur-sm)"
        />
      </g>
    </svg>
  );
}