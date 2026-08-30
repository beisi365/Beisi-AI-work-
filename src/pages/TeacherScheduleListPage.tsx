import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useDemoMode } from '../lib/demoMode';
import { useRepository } from '../hooks/useRepository';
import type { Teacher, TeacherSchedule } from '../data/types';
import { PageHeader, Card, Button, Toast, EmptyState } from '../components/ui';
import { ScheduleEditModal } from '../components/ScheduleEditModal';
import { ScheduleBatchModal } from '../components/ScheduleBatchModal';
import {
  WEEKDAYS,
  monthGrid,
  addMonths,
  formatDate,
  sortByDateTime,
  teacherColor,
} from '../lib/schedule';

interface Loaded {
  schedules: TeacherSchedule[];
  teachers: Teacher[];
}

export default function TeacherScheduleListPage() {
  const { principal } = useAuth();
  const navigate = useNavigate();
  const { data, loading, reload } = useRepository(
    ['teacher_schedules', 'teachers'],
    async (d): Promise<Loaded> => {
      const [schedules, teachers] = await Promise.all([
        d.teacherSchedules.list(),
        d.teachers.list(),
      ]);
      return { schedules, teachers };
    },
  );

  const currentTeacherId = principal?.teacherId ?? 't1';
  const isAdmin = principal?.role === 'admin';
  const { readOnly: demoReadOnly } = useDemoMode();
  // 运营管理员可自选归属老师并统改全部 5 位；普通老师仅能改自己的排班；演示模式（?demo）一律只读
  const canPickTeacher = isAdmin && !demoReadOnly;
  const canEdit = (ownerId: string) =>
    !demoReadOnly &&
    (isAdmin || (principal?.role === 'teacher' && principal.teacherId === ownerId));

  const [filter, setFilter] = useState<string>('all');
  const [view, setView] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const [modalOpen, setModalOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherSchedule | null>(null);
  const [prefillDate, setPrefillDate] = useState<string>('');
  const [toast, setToast] = useState('');

  const schedules = data?.schedules ?? [];
  const teachers = data?.teachers ?? [];

  const visible = useMemo(
    () => (filter === 'all' ? schedules : schedules.filter((s) => s.teacher_id === filter)),
    [schedules, filter],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, TeacherSchedule[]>();
    for (const s of visible) {
      const arr = m.get(s.schedule_date) ?? [];
      arr.push(s);
      m.set(s.schedule_date, arr);
    }
    for (const arr of m.values()) arr.sort(sortByDateTime);
    return m;
  }, [visible]);

  const cells = monthGrid(view.year, view.month);
  const todayKey = formatDate(new Date());

  function openNew(prefill?: string) {
    setEditing(null);
    setPrefillDate(prefill ?? '');
    setModalOpen(true);
  }
  function openEdit(s: TeacherSchedule) {
    setEditing(s);
    setPrefillDate(s.schedule_date);
    setModalOpen(true);
  }
  function onSaved() {
    setToast('已保存');
    reload();
    window.setTimeout(() => setToast(''), 2000);
  }

  return (
    <div>
      <PageHeader
        title="教师排班表"
        desc="5 位老师的整体时间排版总览；每位老师各管各的排班，后台可见全部。点击日期新增，点击排课条目编辑。"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filter !== 'all' && (
              <Button onClick={() => navigate(`/t/schedule/${filter}`)}>
                查看 {teachers.find((t) => t.id === filter)?.name} 的完整排班页 →
              </Button>
            )}
            {!demoReadOnly && (isAdmin || principal?.role === 'teacher') && (
              <Button onClick={() => setBatchOpen(true)}>批量生成</Button>
            )}
            {!demoReadOnly && (
              <Button variant="primary" onClick={() => openNew()}>
                + 新增排班
              </Button>
            )}
          </div>
        }
      />

      {/* 老师筛选 + 图例 / 下钻 */}
      <Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterChip
            active={filter === 'all'}
            color="#8A8F98"
            label="全部"
            onClick={() => setFilter('all')}
          />
          {teachers.map((t) => (
            <FilterChip
              key={t.id}
              active={filter === t.id}
              color={teacherColor(t.id)}
              label={t.name}
              onClick={() => setFilter(t.id)}
              onDrill={() => navigate(`/t/schedule/${t.id}`)}
            />
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        {/* 月历 */}
        <Card
          title={`${view.year} 年 ${view.month + 1} 月`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="sm"
                onClick={() => setView(addMonths(view.year, view.month, -1))}
              >
                ‹ 上月
              </Button>
              <Button size="sm" onClick={() => setView({ year: new Date().getFullYear(), month: new Date().getMonth() })}>
                今天
              </Button>
              <Button
                size="sm"
                onClick={() => setView(addMonths(view.year, view.month, 1))}
              >
                下月 ›
              </Button>
            </div>
          }
          style={{ flex: '1 1 520px', minWidth: 320 }}
        >
          {loading ? (
            <EmptyState title="加载中…" />
          ) : (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 4,
                  marginBottom: 4,
                }}
              >
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    style={{ textAlign: 'center', fontSize: 12, color: '#8A8F98', padding: '4px 0' }}
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {cells.map((cell, i) => {
                  if (!cell.date) return <div key={i} style={{ minHeight: 76 }} />;
                  const key = formatDate(cell.date);
                  const items = byDate.get(key) ?? [];
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={i}
                      onClick={() => openNew(key)}
                      style={{
                        minHeight: 76,
                        border: `1px solid ${isToday ? teacherColor('t1') : '#ECECEC'}`,
                        borderRadius: 8,
                        padding: 4,
                        background: isToday ? 'rgba(255,122,26,0.06)' : '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: isToday ? teacherColor('t1') : '#9AA0A6',
                          fontWeight: isToday ? 700 : 400,
                        }}
                      >
                        {cell.date.getDate()}
                      </div>
                      {items.slice(0, 3).map((s) => {
                        const editable = canEdit(s.teacher_id);
                        return (
                          <div
                            key={s.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(s);
                            }}
                            title={`${s.start_time}–${s.end_time} ${s.title}`}
                            style={{
                              fontSize: 11,
                              lineHeight: 1.25,
                              padding: '2px 4px',
                              borderRadius: 4,
                              background: editable ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)',
                              borderLeft: `3px solid ${teacherColor(s.teacher_id)}`,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ color: teacherColor(s.teacher_id), fontWeight: 600 }}>
                              {s.start_time}
                            </span>{' '}
                            {s.title}
                          </div>
                        );
                      })}
                      {items.length > 3 && (
                        <div style={{ fontSize: 10, color: '#9AA0A6' }}>+{items.length - 3} 条</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* 老师下钻面板 */}
        <Card
          title="二级页面 · 按老师查看完整排班"
          desc="点击任意老师，进入 TA 的独立排班页（可增删改本人排班）"
          style={{ flex: '1 1 260px', minWidth: 240 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teachers.map((t) => {
              const count = schedules.filter((s) => s.teacher_id === t.id).length;
              return (
                <button
                  key={t.id}
                  onClick={() => navigate(`/t/schedule/${t.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid #ECECEC',
                    borderRadius: 10,
                    background: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: teacherColor(t.id),
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#9AA0A6' }}>{count} 条排班</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#FF7A1A' }}>查看 ›</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <ScheduleEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existing={editing}
        defaultTeacherId={
          editing
            ? editing.teacher_id
            : canPickTeacher && filter !== 'all'
              ? filter
              : currentTeacherId
        }
        canPickTeacher={canPickTeacher}
        teachers={teachers}
        currentUserId={principal?.userId ?? 'unknown'}
        currentRole={(principal?.role ?? 'teacher') as 'teacher' | 'student' | 'admin'}
        onSaved={onSaved}
        readOnly={editing ? !canEdit(editing.teacher_id) : demoReadOnly}
        prefillDate={prefillDate}
      />

      <ScheduleBatchModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        existing={schedules}
        teachers={teachers}
        currentUserId={principal?.userId ?? 'unknown'}
        currentRole={(principal?.role ?? 'teacher') as 'teacher' | 'student' | 'admin'}
        canPickTeacher={canPickTeacher}
        defaultTeacherId={currentTeacherId}
        onSaved={onSaved}
      />

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function FilterChip({
  active,
  color,
  label,
  onClick,
  onDrill,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
  onDrill?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? color : '#E2E2E2'}`,
        background: active ? `${color}1A` : '#fff',
        color: active ? color : '#444',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      {label}
      {onDrill && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onDrill();
          }}
          style={{ marginLeft: 4, fontSize: 11, color: '#FF7A1A', textDecoration: 'underline' }}
        >
          详情
        </span>
      )}
    </span>
  );
}
