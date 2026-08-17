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
  style,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`} style={style}>
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

export function Tag({ tone = 'neutral', children, style }: { tone?: Tone; children: ReactNode; style?: CSSProperties }) {
  return <span className={`tag tag--${tone}`} style={style}>{children}</span>;
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

// ============================================================
// 对话框（新增 / 编辑 / 调班 / 归档确认共用）
// 移动端自动变为底部抽屉式弹出，避免遮挡底部导航
// ============================================================
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 540,
}: {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        {title && (
          <div className="modal-head">
            <h3 className="modal-title">{title}</h3>
            <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** 表单字段包装：统一 label / 必填星号 / 错误与提示 */
export function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`form-field${error ? ' form-field--error' : ''}`}>
      <label className="form-label">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <div className="form-hint">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

/** 轻量提示条（成功 / 警告），固定顶部居中 */
export function Toast({
  tone = 'success',
  children,
}: {
  tone?: 'success' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  return <div className={`toast toast--${tone}`}>{children}</div>;
}
