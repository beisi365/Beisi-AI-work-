import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useRepository } from '../../hooks/useRepository';
import { db } from '../../data/repository';
import { Button, Card, EmptyState, FormField, Modal, PageHeader, Tag, Toast } from '../../components/ui';
import type { Student, Todo } from '../../data/types';
import { completeTodo, type AlertActor } from '../../lib/alerts';
import { useDemoMode } from '../../lib/demoMode';

export default function TodosPage() {
  const navigate = useNavigate();
  const { principal } = useAuth();
  const { readOnly } = useDemoMode();
  const actor: AlertActor = { actorId: principal?.teacherId ?? principal?.userId ?? '', actorRole: 'teacher' };

  const [toast, setToast] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [relatedStudentId, setRelatedStudentId] = useState('');
  const [due, setDue] = useState('');

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  const { data, loading } = useRepository(['todos', 'students'], async (d) => {
    const [todos, students] = await Promise.all([d.todos.list(), d.students.list()]);
    return { todos, students };
  });

  if (loading || !data) return <div className="loading">加载中…</div>;

  const studentMap = new Map<string, Student>(data.students.map((s) => [s.id, s]));
  const nameOf = (id: string | null) => (id ? studentMap.get(id)?.nickname ?? id : '');

  const sorted = [...data.todos].sort((a, b) => {
    // 未完成优先，其次按创建时间倒序
    const ad = a.status === 'done' ? 1 : 0;
    const bd = b.status === 'done' ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return (b.created_at ?? 0) - (a.created_at ?? 0);
  });

  const canSave = title.trim().length > 0;

  const onCreate = async () => {
    if (!canSave) return;
    await db.todos.insert(
      {
        owner_type: 'teacher',
        owner_id: actor.actorId,
        title: title.trim(),
        related_student_id: relatedStudentId || null,
        due: due || null,
        status: 'todo',
      },
      { actorId: actor.actorId, actorRole: actor.actorRole },
    );
    setTitle('');
    setRelatedStudentId('');
    setDue('');
    setCreateOpen(false);
    flash('待办已创建');
  };

  const onComplete = async (t: Todo) => {
    await completeTodo(db, t.id, actor);
    flash('待办已完成');
  };

  return (
    <>
      <PageHeader
        title="教师待办"
        desc="教师自行创建的跟进事项；预警可手动转为待办，系统不会自动生成待办"
        actions={
          !readOnly && (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              + 新建待办
            </Button>
          )
        }
      />

      {sorted.length === 0 ? (
        <Card>
          <EmptyState title="暂无待办" hint="点击右上角「新建待办」添加跟进事项" />
        </Card>
      ) : (
        <Card>
          <div className="list">
            {sorted.map((t) => (
              <div key={t.id} className="list-item">
                <div className="focus-main">
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={t.status === 'done' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                      {t.title}
                    </strong>
                    <Tag tone={t.status === 'done' ? 'success' : 'accent'}>
                      {t.status === 'done' ? '已完成' : '待办'}
                    </Tag>
                  </div>
                  <div className="muted">
                    {nameOf(t.related_student_id) && <>关联学员：{nameOf(t.related_student_id)} · </>}
                    {t.due ? `截止：${t.due}` : '无截止'}
                  </div>
                </div>
                <div className="alert-actions">
                  {t.related_student_id && (
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/t/students/${t.related_student_id}`)}>
                      查看学员
                    </Button>
                  )}
                  {t.status !== 'done' && !readOnly && (
                    <Button size="sm" variant="primary" onClick={() => onComplete(t)}>
                      完成
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 新建待办弹窗 */}
      <Modal
        open={createOpen}
        title="新建待办"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={onCreate} disabled={!canSave}>
              创建
            </Button>
          </>
        }
      >
        <div className="stack">
          <FormField label="待办内容" required error={title.trim() ? undefined : undefined}>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：电话回访学员家长"
            />
          </FormField>
          <FormField label="关联学员（可选）">
            <select className="input" value={relatedStudentId} onChange={(e) => setRelatedStudentId(e.target.value)}>
              <option value="">不关联学员</option>
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nickname}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="截止日期（可选）">
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </FormField>
        </div>
      </Modal>

      {toast && <Toast tone="success">{toast}</Toast>}
    </>
  );
}
