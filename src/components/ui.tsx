import type { ReactNode, CSSProperties } from 'react';

export type Tone = 'accent' | 'success' | 'danger' | 'neutral' | 'weak' | 'review';

// ============================================================
// 布局基础
// ============================================================
export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  desc,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <div className="card-title">{title}</div>}
            {desc && <div className="card-desc">{desc}</div>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'card-body' : 'card-body card-body--flush'}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="stat-tile">
      <div className={`stat-value${accent ? ' stat-value--accent' : ''}`}>{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

export function ProgressBar({
  value,
  tone = 'accent',
  showLabel,
}: {
  value: number;
  tone?: Tone;
  showLabel?: boolean;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="progress">
      <div className="progress-track">
        <div
          className={`progress-fill progress-fill--${tone}`}
          style={{ width: `${Math.round(v * 100)}%` }}
        />
      </div>
      {showLabel && <span className="progress-label">{Math.round(v * 100)}%</span>}
    </div>
  );
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
}: {
  items: { key: T; label: string }[];
  active: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={it.key === active}
          className={`tab${it.key === active ? ' tab--active' : ''}`}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = '加载中…' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
  };
  return (
    <span className="avatar" style={style} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

/** 定义式字段行：左标签右内容（档案页常用） */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{children}</div>
    </div>
  );
}

/** 响应式网格 */
export function Grid({ children, min = 240 }: { children: ReactNode; min?: number }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
