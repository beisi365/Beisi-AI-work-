// ============================================================
// 首页 Hero 装饰：黑洞球 + 多圈粒子环（吸积盘效果）
// 纯 SVG + CSS 动画，零外部依赖。
// - 中央黑色球：径向渐变做 3D 质感；边缘橙色描边
// - 5 圈椭圆粒子环：stroke-dasharray + stroke-dashoffset 动画，
//   产生"粒子沿环流动"的视错觉 → 黑洞吸积盘
// - 高光斑绕球公转：transform-origin 球心，rotate 360deg
//   → 球面"在转"的视觉感（用户原话："球面一直转动"）
// - 背景径向辉光 + 球周光晕：CSS 呼吸动画
// - prefers-reduced-motion: reduce 时全部关闭
// ============================================================
export function HeroSphere({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`hero-sphere ${className}`}
      viewBox="0 0 600 500"
      role="img"
      aria-label="动画装饰：中心球与环绕粒子环"
    >
      <defs>
        {/* 背景大范围橙色辉光 */}
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

        <filter id="hs-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="hs-blur-sm">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* 背景大辉光 */}
      <circle
        className="hs-halo"
        cx="300"
        cy="250"
        r="240"
        fill="url(#hs-glow)"
        filter="url(#hs-blur)"
      />

      {/* 吸积盘：多圈粒子环（不同 rx/ry/dash/速度） */}
      <g className="hs-rings">
        <ellipse
          className="hs-ring hs-ring-1"
          cx="300"
          cy="250"
          rx="278"
          ry="38"
          fill="none"
          stroke="#FF7A1A"
          strokeWidth="1.6"
          strokeDasharray="3 8"
          opacity="0.75"
        />
        <ellipse
          className="hs-ring hs-ring-2"
          cx="300"
          cy="250"
          rx="238"
          ry="64"
          fill="none"
          stroke="#ff8030"
          strokeWidth="1.3"
          strokeDasharray="2 10"
          opacity="0.6"
        />
        <ellipse
          className="hs-ring hs-ring-3"
          cx="300"
          cy="250"
          rx="190"
          ry="26"
          fill="none"
          stroke="#e85a20"
          strokeWidth="1.7"
          strokeDasharray="4 6"
          opacity="0.85"
        />
        <ellipse
          className="hs-ring hs-ring-4"
          cx="300"
          cy="250"
          rx="148"
          ry="48"
          fill="none"
          stroke="#FF7A1A"
          strokeWidth="1.1"
          strokeDasharray="2 14"
          opacity="0.55"
        />
        <ellipse
          className="hs-ring hs-ring-5"
          cx="300"
          cy="250"
          rx="108"
          ry="20"
          fill="none"
          stroke="#ffa050"
          strokeWidth="1.4"
          strokeDasharray="3 5"
          opacity="0.7"
        />
        <ellipse
          className="hs-ring hs-ring-6"
          cx="300"
          cy="250"
          rx="76"
          ry="12"
          fill="none"
          stroke="#ff6020"
          strokeWidth="1.2"
          strokeDasharray="2 4"
          opacity="0.55"
        />
      </g>

      {/* 中心黑洞球 + 高光 */}
      <g className="hs-sphere-group">
        {/* 球周光晕 */}
        <circle
          className="hs-sphere-halo"
          cx="300"
          cy="250"
          r="60"
          fill="url(#hs-rim)"
          filter="url(#hs-blur)"
        />
        {/* 球体 */}
        <circle cx="300" cy="250" r="42" fill="url(#hs-sphere)" />
        {/* 边缘高光环 */}
        <circle
          cx="300"
          cy="250"
          r="42"
          fill="none"
          stroke="#FF7A1A"
          strokeWidth="0.8"
          opacity="0.55"
        />
        {/* 球面高光斑（绕球公转 → 球面"在转"的视觉感） */}
        <ellipse
          className="hs-spec"
          cx="300"
          cy="216"
          rx="7"
          ry="9"
          fill="url(#hs-spec)"
          filter="url(#hs-blur-sm)"
        />
      </g>
    </svg>
  );
}