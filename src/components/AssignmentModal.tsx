import { useEffect, useState } from 'react';
import { db } from '../data/repository';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import { Modal, FormField, Button } from '../components/ui';
import { formatDate } from '../lib/format';
import type { Assignment } from '../data/types';

interface Props {
  open: boolean;
  onClose: () => void;
  assignment?: Assignment | null;
  onSaved: () => void;
}

/**
 * 教师作业新建 / 编辑弹窗。
 * 复用现有 Assignment 数据模型与 db.assignments Repository；教师可写（权限层允许），
 * 学员写入会被权限层拒绝。不新增表 / 字段 / 状态枚举。
 */
export default function AssignmentModal({ open, onClose, assignment, onSaved }: Props) {
  const { principal } = useAuth();
  const { data } = useRepository(
    ['classes', 'lessons', 'courses', 'class_sessions'],
    async (d) => {
      const [classes, lessons, courses, classSessions] = await Promise.all([
        d.classes.list(),
        d.lessons.list(),
        d.courses.list(),
        d.classSessions.list(),
      ]);
      return { classes, lessons, courses, classSessions };
    },
  );

  const [classId, setClassId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [title, setTitle] = useState('');
  const [requirements, setRequirements] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [rubric, setRubric] = useState('');
  const [saving, setSaving] = useState(false);

  // 打开或切换编辑对象时重置表单
  useEffect(() => {
    if (!open) return;
    if (assignment) {
      setClassId(assignment.class_id);
      setLessonId(assignment.lesson_id);
      setSessionId(assignment.class_session_id ?? '');
      setTitle(assignment.title);
      setRequirements(assignment.requirements);
      setDueDate(assignment.due_date);
      setRubric(assignment.rubric);
    } else {
      setClassId(data?.classes?.[0]?.id ?? '');
      setLessonId(data?.lessons?.[0]?.id ?? '');
      setSessionId('');
      setTitle('');
      setRequirements('');
      setDueDate('');
      setRubric('');
    }
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment]);

  const classes = data?.classes ?? [];
  const lessons = data?.lessons ?? [];
  const courses = data?.courses ?? [];
  const sessions = data?.classSessions ?? [];
  const courseName = (lid: string): string => {
    const ls = lessons.find((l) => l.id === lid);
    const c = ls ? courses.find((c) => c.id === ls.course_id) : undefined;
    return c ? c.title : '未知课程';
  };
  const sessionsOfClass = sessions.filter((s) => s.class_id === classId);

  const canSave = Boolean(classId && lessonId && title.trim());

  const handleSave = async () => {
    if (!canSave || !principal) return;
    setSaving(true);
    const actorId = principal.teacherId ?? principal.userId ?? '';
    try {
      if (assignment) {
        await db.assignments.update(
          assignment.id,
          {
            class_id: classId,
            lesson_id: lessonId,
            class_session_id: sessionId || null,
            title: title.trim(),
            requirements: requirements.trim(),
            due_date: dueDate || '',
            rubric: rubric.trim(),
          },
          { actorId, actorRole: 'teacher' },
        );
      } else {
        await db.assignments.insert(
          {
            class_id: classId,
            lesson_id: lessonId,
            class_session_id: sessionId || null,
            title: title.trim(),
            requirements: requirements.trim(),
            due_date: dueDate || '',
            rubric: rubric.trim(),
            created_by: actorId,
          },
          { actorId, actorRole: 'teacher' },
        );
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={assignment ? '编辑作业' : '新建作业'} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <FormField label="班级">
          <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="课节（自动关联课程）">
          <select className="select" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {courseName(l.id)} · {l.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="课次（可选，绑定实际授课场次）">
          <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">不绑定具体课次</option>
            {sessionsOfClass.map((s) => (
              <option key={s.id} value={s.id}>
                {s.status === 'done' ? '已上' : '待上'} · {formatDate(s.scheduled_start)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="标题">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="作业标题"
          />
        </FormField>
        <FormField label="要求">
          <textarea
            className="textarea"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="作业要求说明…"
          />
        </FormField>
        <FormField label="截止时间">
          <input
            type="date"
            className="input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </FormField>
        <FormField label="评分标准">
          <textarea
            className="textarea"
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            placeholder="评分标准说明…"
          />
        </FormField>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? '保存中…' : '保存作业'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
