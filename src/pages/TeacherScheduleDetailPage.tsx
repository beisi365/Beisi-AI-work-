import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useDemoMode } from '../lib/demoMode';
import { useRepository } from '../hooks/useRepository';
import type { Teacher, TeacherSchedule } from '../data/types';
import { PageHeader, Card, Button, Toast, EmptyState } from '../components/ui';
import { ScheduleEditModal } from '../components/ScheduleEditModal';
import {
  WEEKDAYS,
  parseDate,
  formatDate,
  sortByDateTime,
  teacherColor,
  timeRange,
} from '../lib/schedule';

interface Loaded {
  schedules: TeacherSchedule[];
  teachers: Teacher[];
}

export default function TeacherScheduleDetailPage() {
  const { teacherId = '' } = useParams();
  const { principal } = useAuth();
  const navigate = useNavigate();

  const { data, loading, reload } = useRepository(
    ['teacher_schedules', 'teachers'],
    async (d): Promise<Loaded> => {
      const [schedules, teachers] = await Promise.all([
        d.teacherSchedules.list({ where: { teacher_id: teacherId } }),
        d.teachers.list(),
      ]);
      return { schedules, teachers };
    },
  );

  const isAdmin = principal?.role === 'admin';
  const { readOnly: demoReadOnly } = useDemoMode();
  // 运营管理员可统改任意老师的排班；普通老师仅能改自己的；演示模式（?demo）一律只读
  const canEdit = isAdmin || (principal?.role === 'teacher' && principal.teacherId === teacherId);
  const editable = canEdit && !demoReadOnly;

  const teachers = data?.teachers ?? [];
  const schedules = data?.schedules ?? [];
  const teacher = teachers.find((t) => t.id === teacherId);
  const color = teacherColor(teacherId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherSchedule | null>(null);
  const [toast, setToast] = useState('');

  const groups = useMemo(() => {
    const m = new Map<string, TeacherSchedule[]>();
    for (const s of schedules) {
      const arr = m.get(s.schedule_date) ?? [];
      arr.push(s);
      m.set(s.schedule_date, arr);
    }
    for (const arr of m.values()) arr.sort(sortByDateTime);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [schedules]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(s: TeacherSchedule) {
    setEditing(s);
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
        title={`${teacher?.name ?? teacherId} · 排班`}
        desc={
          demoReadOnly
            ? '演示模式（只读）：登录教师或管理员账号后可编辑排班。'
            : editable
              ? isAdmin
                ? '运营视角：可统管并修改该老师的排班，保存后即时同步到云端。'
                : '可在此新增 / 编辑 / 删除自己的排班，保存后即时同步到云端。'
              : '你正在查看该老师的排班（只读）。'
        }
        actions={
          <>
            <Button onClick={() => navigate('/t/schedule')}>← 返回总表</Button>
            {editable && (
              <Button variant="primary" onClick={openNew}>
                + 新增排班
              </Button>
            )}
          </>
        }
      />

      {!editable && (
        <div
          className="alert-info"
          style={{ marginBottom: 16 }}
        >
          {demoReadOnly
            ? '当前为演示模式（只读）。请用真实教师或管理员账号登录后，才能新增 / 编辑排班。'
            : <>这是 <b>{teacher?.name ?? teacherId}</b> 老师的排班，你仅有查看权限。如需修改，请切换到对应老师账号。</>}
        </div>
      )}

      <Card
        title="排班议程"
        desc={groups.length ? `共 ${schedules.length} 条，按日期排列` : undefined}
      >
        {loading ? (
          <EmptyState title="加载中…" />
        ) : groups.length === 0 ? (
          <EmptyState title="暂无排班" hint={canEdit ? '点击右上角「新增排班」开始排课' : '该老师尚未录入排班'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map(([date, items]) => {
              const d = parseDate(date);
              const wd = WEEKDAYS[d.getDay()];
              const isPast = date < formatDate(new Date());
              return (
                <div key={date}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      marginBottom: 8,
                      paddingBottom: 6,
                      borderBottom: '1px solid #F0F0F0',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{date}</span>
                    <span style={{ color: '#9AA0A6', fontSize: 13 }}>周{wd}</span>
                    {isPast && <span style={{ fontSize: 12, color: '#B0B0B0' }}>已结束</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'flex-start',
                          padding: 12,
                          border: '1px solid #EEE',
                          borderRadius: 10,
                          background: '#fff',
                        }}
                      >
                        <div
                          style={{
                            width: 4,
                            alignSelf: 'stretch',
                            borderRadius: 4,
                            background: color,
                            minHeight: 36,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{s.title}</div>
                          <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                            {timeRange(s)}
                            {s.location ? ` · ${s.location}` : ''}
                          </div>
                          {s.note && (
                            <div style={{ fontSize: 13, color: '#9AA0A6', marginTop: 4 }}>{s.note}</div>
                          )}
                        </div>
                        {editable && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button size="sm" onClick={() => openEdit(s)}>
                              编辑
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ScheduleEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existing={editing}
        defaultTeacherId={teacherId}
        canPickTeacher={isAdmin}
        teachers={teachers}
        currentUserId={principal?.userId ?? 'unknown'}
        currentRole={(principal?.role ?? 'teacher') as 'teacher' | 'student' | 'admin'}
        onSaved={onSaved}
        readOnly={!editable}
      />

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
