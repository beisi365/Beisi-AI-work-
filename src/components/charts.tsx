import type { ReactNode } from 'react';

/** 迷你折线图（能力历史等），纯 SVG，无第三方依赖 */
export function Sparkline({
  values,
  width = 120,
  height = 36,
  color = 'var(--color-accent)',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length === 0) return <span className="muted">暂无</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${height} ${pts.join(' ')} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polygon points={area} fill={color} opacity={0.08} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / span) * (height - 6) - 3;
        return <circle key={i} cx={x} cy={y} r={2} fill={color} />;
      })}
    </svg>
  );
}

/** 横向排行条（学习困难排行，替代词云） */
export function RankBar({
  label,
  count,
  max,
  hint,
  highlight,
}: {
  label: ReactNode;
  count: number;
  max: number;
  hint?: ReactNode;
  highlight?: boolean;
}) {
  const pct = max ? Math.round((count / max) * 100) : 0;
  return (
    <div className={`rank-row${highlight ? ' rank-row--hl' : ''}`}>
      <div className="rank-head">
        <span className="rank-label">{label}</span>
        <span className="rank-count">{count} 次</span>
      </div>
      <div className="rank-track">
        <div
          className="rank-fill"
          style={{ width: `${pct}%`, background: highlight ? 'var(--color-accent)' : 'var(--color-neutral)' }}
        />
      </div>
      {hint && <div className="rank-hint">{hint}</div>}
    </div>
  );
}
