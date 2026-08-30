import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import { Button, Card, EmptyState, LoadingState, PageHeader, Tag } from '../components/ui';
import {
  conflictedIds,
  parseDate,
  sortByDateTime,
  teacherColor,
  teacherName,
} from '../lib/schedule';
import type { TeacherSchedule } from '../data/types';

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function StudentSchedulePage() {
  const { principal } = useAuth();
  const sid = principal?.studentId ?? '';
  const [onlyWeek, setOnlyWeek] = useState(false);

  const { data, loading } = useRepository(
    ['enrollments', 'classes', 'teacher_schedules', 'teachers'],
    async (d) => {
      const myEnrolls = (await d.enrollments.list()).filter(
        (e) => e.student_id === sid,
      );
      const classIds = [...new Set(myEnrolls.map((e) => e.class_id))];
      const myClasses = (await d.classes.list()).filter((c) =>
        classIds.includes(c.id),
      );
      const teacherIds = [...new Set(myClasses.map((c) => c.teacher_id))];
      const schedules = (await d.teacherSchedules.list()).filter((s) =>
        teacherIds.includes(s.teacher_id),
      );
      const teachers = (await d.teachers.list()).filter((t) =>
        teacherIds.includes(t.id),
      );
      return { myClasses, teacherIds, schedules, teachers };
    },
  );

  const teacherIds = data?.teacherIds ?? [];
  const schedules = data?.schedules ?? [];
  const teachers = data?.teachers ?? [];
  const conflicts = useMemo(() => conflictedIds(schedules), [schedules]);

  const groups = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    const list = schedules
      .filter((s) => {
        const dt = parseDate(s.schedule_date);
        if (dt < now) return false;
        if (onlyWeek && dt >= weekEnd) return false;
        return true;
      })
      .sort(sortByDateTime);
    const g: Record<string, TeacherSchedule[]> = {};
    for (const s of list) (g[s.schedule_date] ??= []).push(s);
    return Object.keys(g)
      .sort()
      .map((date) => ({ date, items: g[date] }));
  }, [schedules, onlyWeek]);

  if (loading || !data) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="我的课表"
        desc="只读 · 由老师统一安排，从今天起陆续更新"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button
              variant={onlyWeek ? undefined : 'primary'}
              onClick={() => setOnlyWeek(false)}
            >
              全部
            </Button>
            <Button
              variant={onlyWeek ? 'primary' : undefined}
              onClick={() => setOnlyWeek(true)}
            >
              仅本周
            </Button>
          </div>
        }
      />

      {teacherIds.length > 0 && (
        <div className="alert-info" style={{ marginBottom: 16 }}>
          归属老师：
          {teacherIds.map((tid) => (
            <Tag key={tid} tone="accent" style={{ marginLeft: 6 }}>
              {teacherName(teachers, tid)}
            </Tag>
          ))}
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState title="你暂时还没有排课" hint="请联系你的老师安排课程时间" />
      ) : groups.length === 0 ? (
        <EmptyState title={onlyWeek ? '本周暂无排课' : '暂无即将开始的排课'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((g) => (
            <Card
              key={g.date}
              title={`${g.date} ${WEEKDAYS_CN[parseDate(g.date).getDay()]}`}
              desc={`${g.items.length} 节`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.items.map((s) => {
                  const color = teacherColor(s.teacher_id);
                  const isConflict = conflicts.has(s.id);
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                        padding: 12,
                        border: `1px solid ${isConflict ? '#FAD2CF' : '#EEE'}`,
                        borderRadius: 10,
                        background: isConflict ? '#FFF6F5' : '#fff',
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
                        <div style={{ fontWeight: 600 }}>
                          {s.title}
                          {isConflict && (
                            <span style={{ marginLeft: 8, color: '#D23B2E', fontSize: 12 }}>
                              ⚠ 时间冲突
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                          {s.start_time}–{s.end_time}
                          {s.location ? ` · ${s.location}` : ''}
                          {teacherIds.length > 1
                            ? ` · ${teacherName(teachers, s.teacher_id)}`
                            : ''}
                        </div>
                        {s.note && (
                          <div style={{ fontSize: 13, color: '#9AA0A6', marginTop: 4 }}>
                            {s.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
