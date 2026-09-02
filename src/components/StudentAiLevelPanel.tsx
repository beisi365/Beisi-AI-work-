/**
 * 学员 AI 学习程度·整体分析面板
 * ------------------------------------------------------------------------
 * 派生出每个学员的"AI 学习程度"评级（高/中/初/待补），一张表一眼看完：
 *   - 顶部 4 个数字 Tile（高/中/初/待补人数）
 *   - 3 个分布柱状条（AI 经验 / 优先方向 / 身份职业）
 *   - 按程度点名（高级 / 中级 各列名单，点击跳档案）
 *
 * 派生规则（aiLevelBucket，纯函数供测试与外部脚本共享）：
 *   pending  : teacher_tags 含「待补资料」
 *   high      : ai_experience 含"经常/深度/日常/熟练" 且 priority_direction 非空
 *   mid       : ai_experience 含"偶尔/了解/听说/简单/基础"
 *   low       : ai_experience 含"未使用/没用过" 或 文本为空（且非 pending）
 *   unknown   : 其余无法归类（极少见；归入「初」展示）
 */
import { useState } from 'react';
import type { Student } from '../data/types';
import { displayStudentNo } from '../lib/studentNormalize';

export type AiLevel = 'high' | 'mid' | 'low' | 'pending';

export interface AiLevelBucket {
  level: AiLevel;
  label: string;
  tone: 'accent' | 'success' | 'neutral' | 'warn';
  hint: string;
}

export const AI_LEVEL_META: Record<AiLevel, AiLevelBucket> = {
  high: {
    level: 'high',
    label: '高级',
    tone: 'success',
    hint: '经常使用 + 优先方向明确，可作为学习牵头人',
  },
  mid: {
    level: 'mid',
    label: '中级',
    tone: 'accent',
    hint: '了解/偶尔使用，需重点跟进',
  },
  low: {
    level: 'low',
    label: '初级',
    tone: 'neutral',
    hint: '未使用或基础薄弱，建议打基础',
  },
  pending: {
    level: 'pending',
    label: '待补',
    tone: 'warn',
    hint: '问卷未交/未填齐，需先补登基础信息',
  },
};

/** 派生规则：纯函数，便于单测 */
export function aiLevelBucket(s: Pick<Student, 'ai_experience' | 'priority_direction' | 'teacher_tags'>): AiLevel {
  const tags = s.teacher_tags ?? [];
  if (tags.some((t) => String(t).includes('待补资料'))) return 'pending';
  const exp = (s.ai_experience ?? '').trim();
  const pri = (s.priority_direction ?? '').trim();
  if (/经常|深度|日常|熟练|高频/.test(exp) && pri) return 'high';
  // 频繁使用但未填方向 或 偶尔/了解 → 中级
  if (/经常|深度|日常|熟练|高频|偶尔|了解|听说|简单|基础|零基础|接触过|试过/.test(exp)) return 'mid';
  // 未使用 / 没用过 / 空 / 其它 → 初级
  return 'low';
}

interface Props {
  /** 全部学员（已按班级/可见范围过滤） */
  students: Student[];
  /** 可选：班级归属映射，用于按班级切换 */
  classByStudent?: Map<string, string>;
  /** 可选：点击名单行跳转档案 */
  onJump?: (studentId: string) => void;
  /** 顶部说明文字（默认「报名问卷统计 · 按 AI 学习程度归类」） */
  caption?: string;
}

interface DistRow {
  key: string;
  count: number;
  /** 0~1，用于柱状条宽度 */
  ratio: number;
}

function bucketize<T extends string>(items: T[]): DistRow[] {
  const map = new Map<string, number>();
  for (const k of items) map.set(k || '—未填', (map.get(k || '—未填') ?? 0) + 1);
  const total = items.length || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, ratio: count / total }));
}

/** 把 ai_experience / priority_direction 等多选用「、」分隔的字段拆开计数 */
function explodeMulti(items: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of items) {
    const s = (v ?? '').trim();
    if (!s) continue;
    for (const part of s.split(/[、，,；;]/)) {
      const p = part.trim();
      if (p) out.push(p);
    }
  }
  return out;
}

export default function StudentAiLevelPanel({ students, classByStudent, onJump, caption }: Props) {
  // 排除已归档学员
  const visible = students.filter((s) => !s.archived_at);

  // 按等级归类
  const groups: Record<AiLevel, Student[]> = { high: [], mid: [], low: [], pending: [] };
  for (const s of visible) groups[aiLevelBucket(s)].push(s);

  // 分布柱状条
  const expDist = bucketize(explodeMulti(visible.map((s) => s.ai_experience)));
  const priDist = bucketize(explodeMulti(visible.map((s) => s.priority_direction)));
  const occDist = bucketize(visible.map((s) => (s.occupation ?? '').trim() || '—未填'));

  const total = visible.length;
  const totalLabel = total === students.length ? `${total} 名` : `${total}/${students.length} 名`;

  return (
    <section className="ai-level-panel" data-testid="student-ai-level-panel">
      <div className="ai-level-head">
        <div>
          <h2 className="section-title">学员 AI 学习程度·整体分析</h2>
          <p className="ai-level-caption">{caption ?? `按报名问卷的 AI 使用经验 + 优先方向派生评级 · 共 ${totalLabel}`}</p>
        </div>
      </div>

      {/* 4 个程度 Tile */}
      <div className="ai-level-tiles">
        {(['high', 'mid', 'low', 'pending'] as AiLevel[]).map((lv) => {
          const meta = AI_LEVEL_META[lv];
          const count = groups[lv].length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <div key={lv} className={`ai-level-tile ai-level-tile--${lv}`}>
              <div className="ai-level-tile-row">
                <span className={`ai-level-tile-label ai-level-tile-label--${meta.tone}`}>{meta.label}</span>
                <span className="ai-level-tile-pct">{pct}%</span>
              </div>
              <div className="ai-level-tile-num">{count}</div>
              <div className="ai-level-tile-hint">{meta.hint}</div>
            </div>
          );
        })}
      </div>

      {/* 3 个分布柱状条 */}
      <div className="ai-level-dists">
        <DistBlock title="AI 使用经验" rows={expDist} total={total} />
        <DistBlock title="优先学习方向" rows={priDist} total={total} />
        <DistBlock title="身份职业" rows={occDist} total={total} />
      </div>

      {/* 高级 / 中级 点名 */}
      <div className="ai-level-rosters">
        <RosterBlock
          level="high"
          title={`高级 · ${groups.high.length} 人`}
          students={groups.high}
          classByStudent={classByStudent}
          onJump={onJump}
        />
        <RosterBlock
          level="mid"
          title={`中级 · ${groups.mid.length} 人`}
          students={groups.mid}
          classByStudent={classByStudent}
          onJump={onJump}
          collapsed
        />
        {(groups.low.length > 0 || groups.pending.length > 0) && (
          <RosterBlock
            level="low"
            title={`初级 + 待补 · ${groups.low.length + groups.pending.length} 人`}
            students={[...groups.low, ...groups.pending]}
            classByStudent={classByStudent}
            onJump={onJump}
            collapsed
          />
        )}
      </div>
    </section>
  );
}

function DistBlock({ title, rows, total }: { title: string; rows: DistRow[]; total: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="ai-level-dist">
      <div className="ai-level-dist-title">{title}</div>
      <div className="ai-level-dist-rows">
        {rows.slice(0, 6).map((r) => (
          <div key={r.key} className="ai-level-dist-row">
            <span className="ai-level-dist-key" title={r.key}>{r.key}</span>
            <span className="ai-level-dist-bar">
              <span className="ai-level-dist-bar-fill" style={{ width: `${Math.max(r.ratio * 100, 4)}%` }} />
            </span>
            <span className="ai-level-dist-count">{r.count}</span>
          </div>
        ))}
        {rows.length > 6 && (
          <div className="ai-level-dist-more">还有 {rows.length - 6} 项…</div>
        )}
        {total === 0 && <div className="ai-level-dist-empty">— 暂无数据 —</div>}
      </div>
    </div>
  );
}

function RosterBlock({
  level,
  title,
  students,
  classByStudent,
  onJump,
  collapsed,
}: {
  level: AiLevel;
  title: string;
  students: Student[];
  classByStudent?: Map<string, string>;
  onJump?: (studentId: string) => void;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useCollapsedState(level);
  const isExpanded = !collapsed || open;
  const showList = isExpanded && students.length > 0;
  return (
    <div className={`ai-level-roster ai-level-roster--${level}`}>
      <div className="ai-level-roster-head">
        <span className={`ai-level-roster-label ai-level-roster-label--${AI_LEVEL_META[level].tone}`}>
          {AI_LEVEL_META[level].label}
        </span>
        <span className="ai-level-roster-title">{title}</span>
        {collapsed && students.length > 0 && (
          <button type="button" className="ai-level-roster-toggle" onClick={() => setOpen(!open)}>
            {open ? '收起' : `展开 ${students.length} 人`}
          </button>
        )}
      </div>
      {showList && (
        <div className="ai-level-roster-grid">
          {students.map((s) => {
            const className = classByStudent?.get(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className="ai-level-roster-pill clickable"
                onClick={onJump ? () => onClick(onJump, s.id) : undefined}
                title={`${displayStudentNo(s) || '—'} ${s.nickname} · 点击查看档案`}
              >
                <span className="sno-chip">{displayStudentNo(s) || '—'}</span>
                <span className="ai-level-roster-name">{s.nickname}</span>
                {className && <span className="ai-level-roster-class muted">{className}</span>}
              </button>
            );
          })}
        </div>
      )}
      {!showList && students.length === 0 && (
        <div className="ai-level-roster-empty">— 暂无 —</div>
      )}
    </div>
  );
}

function onClick(onJump: (id: string) => void, id: string) {
  onJump(id);
}

// —— 轻量自管折叠状态（避免每次刷新/切换都默认展开 16 人的中级名单） ——
const COLLAPSE_KEY = 'ai-level-panel:collapsed';
function useCollapsedState(level: AiLevel): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return level !== 'high';
    try {
      const raw = window.sessionStorage.getItem(`${COLLAPSE_KEY}:${level}`);
      if (raw === '0') return false;
      if (raw === '1') return true;
    } catch {}
    return level !== 'high';
  });
  const update = (v: boolean) => {
    setOpen(v);
    try {
      window.sessionStorage.setItem(`${COLLAPSE_KEY}:${level}`, v ? '1' : '0');
    } catch {}
  };
  return [open, update];
}