// ============================================================
// 教师管理页（/t/teachers）
// ------------------------------------------------------------
// 权限模型（与排班页保持一致）：
//   · 运营管理员 admin —— 可编辑全部教师、可新增教师
//   · 教师 teacher     —— 仅可编辑自己那一行，不可新增
//   · 演示态 ?demo     —— 一律只读
// 数据层已放行 admin（permissions.ts canWrite / RLS `or my_role()='admin'`），
// 本页只负责把这份权限在界面上暴露成可用入口，并对外观做角色收敛。
// ============================================================
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useDemoMode } from '../lib/demoMode';
import { useRepository } from '../hooks/useRepository';
import type { ClassRow, Enrollment, Teacher } from '../data/types';
import { Avatar, Button, Card, EmptyState, LoadingState, PageHeader, Tag, Toast } from '../components/ui';
import { TeacherEditModal } from '../components/TeacherEditModal';

interface Loaded {
  teachers: Teacher[];
  classes: ClassRow[];
  enrollments: Enrollment[];
}

export default function TeachersPage() {
  const { principal } = useAuth();
  const { readOnly } = useDemoMode();
  const [editTarget, setEditTarget] = useState<Teacher | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState('');

  const { data, loading } = useRepository(
    ['teachers', 'classes', 'enrollments'],
    async (d): Promise<Loaded> => {
      const [teachers, classes, enrollments] = await Promise.all([
        d.teachers.list(),
        d.classes.list(),
        d.enrollments.list(),
      ]);
      return { teachers, classes, enrollments };
    },
  );

  const isAdmin = principal?.role === 'admin';
  /** 管理员可改全部；教师仅能改自己那一行；演示态只读 */
  const canEdit = (ownerId: string) =>
    !readOnly && (isAdmin || (principal?.role === 'teacher' && principal.teacherId === ownerId));
  const canCreate = isAdmin && !readOnly;

  const teachers = useMemo(
    () => [...(data?.teachers ?? [])].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
    [data?.teachers],
  );

  // 教师 → 所带班级名 + 在读学员数
  const statByTeacher = useMemo(() => {
    const m = new Map<string, { className: string; count: number }>();
    const classes = data?.classes ?? [];
    const enrollments = data?.enrollments ?? [];
    for (const c of classes) {
      const count = enrollments.filter((e) => e.class_id === c.id).length;
      const prev = m.get(c.teacher_id);
      // 一位教师可能带多个班：合并显示，人数累加
      m.set(c.teacher_id, {
        className: prev ? `${prev.className}、${c.name}` : c.name,
        count: (prev?.count ?? 0) + count,
      });
    }
    return m;
  }, [data?.classes, data?.enrollments]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  if (loading) return <LoadingState label="正在加载教师信息…" />;

  return (
    <div>
      <PageHeader
        title="教师管理"
        desc={
          isAdmin
            ? '运营管理员可编辑全部教师资料并新增教师'
            : '可查看全部教师资料，仅能编辑本人信息'
        }
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              + 新增教师
            </Button>
          ) : undefined
        }
      />

      <div className="filters">
        <span className="muted">共 {teachers.length} 位教师</span>
      </div>

      <Card title="教师列表">
        {teachers.length === 0 ? (
          <EmptyState title="暂无教师" hint="点击右上角「新增教师」录入第一位教师" />
        ) : (
          <table className="stable">
            <thead>
              <tr>
                <th>教师</th>
                <th>身份</th>
                <th>教学内容</th>
                <th>所带班级</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => {
                const stat = statByTeacher.get(t.id);
                const mine = principal?.teacherId === t.id;
                const editable = canEdit(t.id);
                return (
                  <tr key={t.id}>
                    <td data-label="教师">
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar name={t.name} />
                        <div>
                          <strong>{t.name}</strong>
                          {mine && (
                            <Tag tone="accent" style={{ marginLeft: 6 }}>
                              本人
                            </Tag>
                          )}
                          <div className="muted" style={{ fontSize: 12 }}>
                            {t.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="身份">{t.title || 'AI 讲师'}</td>
                    <td data-label="教学内容">{t.subjects}</td>
                    <td data-label="所带班级" className="muted">
                      {stat ? `${stat.className}（${stat.count} 人）` : '未带班'}
                    </td>
                    <td data-label="操作">
                      {editable ? (
                        <div className="list-actions">
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(t)}>
                            编辑
                          </Button>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {readOnly ? '演示只读' : '无权编辑'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="教师介绍">
        {teachers.length === 0 ? (
          <EmptyState title="暂无教师介绍" />
        ) : (
          <div className="class-group">
            {teachers.map((t) => (
              <div key={t.id} className="work-card">
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={t.name} size={32} />
                  <div>
                    <strong>
                      {t.name}
                      <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                        {t.title || 'AI 讲师'}
                      </span>
                    </strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {t.subjects}
                    </div>
                  </div>
                </div>
                <p style={{ margin: '8px 0 0', lineHeight: 1.7 }}>{t.bio || '暂无简介'}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <TeacherEditModal
        open={!!editTarget}
        teacher={editTarget}
        mode="edit"
        onClose={() => setEditTarget(null)}
        onSaved={() => flash('教师信息已更新')}
      />
      <TeacherEditModal
        open={createOpen}
        teacher={null}
        mode="create"
        existingIds={teachers.map((t) => t.id)}
        onClose={() => setCreateOpen(false)}
        onSaved={() => flash('已新增教师')}
      />

      {toast && <Toast tone="success">{toast}</Toast>}
    </div>
  );
}
