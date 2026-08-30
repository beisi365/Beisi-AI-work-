import { useEffect, useState } from 'react';
import { db } from '../data/repository';
import type { ChangeActor } from '../lib/submissionStatusGuards';
import type { Teacher, TeacherSchedule } from '../data/types';
import { Modal, FormField, Button } from './ui';
import { teacherColor, teacherName, findConflicts } from '../lib/schedule';

interface Props {
  open: boolean;
  onClose: () => void;
  existing: TeacherSchedule | null;
  /** 全量排班（用于保存前的同老师同天时间冲突检测） */
  allSchedules: TeacherSchedule[];
  /** 新建时默认归属老师；不可自选时为锁定值 */
  defaultTeacherId: string;
  /** 是否允许自选老师（admin/后台运营场景）；普通老师锁定本人 */
  canPickTeacher: boolean;
  teachers: Teacher[];
  currentUserId: string;
  currentRole: 'teacher' | 'student' | 'admin';
  /** 保存成功后回调（页面刷新 + 提示） */
  onSaved?: () => void;
  /** 只读模式（无编辑权限时查看详情） */
  readOnly?: boolean;
  /** 新建时预填日期（点击日历某天时带入） */
  prefillDate?: string;
}

export function ScheduleEditModal({
  open,
  onClose,
  existing,
  allSchedules,
  defaultTeacherId,
  canPickTeacher,
  teachers,
  currentUserId,
  currentRole,
  onSaved,
  readOnly = false,
  prefillDate,
}: Props) {
  const [teacherId, setTeacherId] = useState(defaultTeacherId);
  const [date, setDate] = useState('');
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('21:00');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [conflictWarn, setConflictWarn] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setConflictWarn('');
    if (existing) {
      setTeacherId(existing.teacher_id);
      setDate(existing.schedule_date);
      setStart(existing.start_time);
      setEnd(existing.end_time);
      setTitle(existing.title);
      setLocation(existing.location);
      setNote(existing.note);
    } else {
      setTeacherId(defaultTeacherId);
      setDate(prefillDate ?? '');
      setStart('19:00');
      setEnd('21:00');
      setTitle('');
      setLocation('');
      setNote('');
    }
  }, [open, existing, defaultTeacherId]);

  async function handleSave(force = false) {
    setError('');
    if (!date) return setError('请选择日期');
    if (!title.trim()) return setError('请填写排课标题');
    if (start >= end) return setError('结束时间需晚于开始时间');

    // 时间冲突检测：同老师同天且时段重叠（与既有排班比较，排除自身）
    const conflicts = findConflicts(
      { teacher_id: teacherId, schedule_date: date, start_time: start, end_time: end },
      allSchedules,
      existing?.id,
    );
    if (conflicts.length > 0 && !force) {
      setConflictWarn(
        `该老师当天已有 ${conflicts.length} 条排班时间重叠：${conflicts
          .map((c) => `${c.start_time}–${c.end_time} ${c.title}`)
          .join('；')}。如确属连续课程或不同地点，可点「仍要保存」。`,
      );
      setSaving(false);
      return;
    }

    setSaving(true);
    try {
      const actor: ChangeActor = {
        actorRole: currentRole === 'student' ? 'student' : 'teacher',
        actorId: currentUserId,
      };
      const payload = {
        teacher_id: teacherId,
        schedule_date: date,
        start_time: start,
        end_time: end,
        title: title.trim(),
        location: location.trim(),
        note: note.trim(),
      };
      if (existing) {
        await db.teacherSchedules.update(existing.id, payload, actor);
      } else {
        await db.teacherSchedules.insert({ ...payload, created_by: currentUserId }, actor);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      const msg = (e as Error).message || '保存失败';
      // RLS / 权限类错误给出面向用户的中文指引，避免裸露英文
      if (/row-level security|policy|permission|denied|42501/i.test(msg)) {
        setError(
          '保存被拒绝：当前账号没有该排班的写入权限。演示模式为只读，请用真实教师或管理员账号登录后再操作。',
        );
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!window.confirm('确定删除这条排班吗？')) return;
    try {
      await db.teacherSchedules.remove(existing.id);
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as Error).message || '删除失败');
    }
  }

  const disabled = readOnly || saving;

  return (
    <Modal
      open={open}
      title={readOnly ? '排班详情' : existing ? '编辑排班' : '新增排班'}
      onClose={onClose}
      footer={
        readOnly ? (
          <Button onClick={onClose}>关闭</Button>
        ) : (
          <>
            {existing && (
              <Button variant="danger" onClick={handleDelete} disabled={saving}>
                删除
              </Button>
            )}
            <span style={{ flex: 1 }} />
            <Button onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </>
        )
      }
    >
      {canPickTeacher && !readOnly && (
        <FormField label="归属老师" required>
          <select
            className="input"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            disabled={disabled}
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {!canPickTeacher && (
        <div className="form-field">
          <label className="form-label">归属老师</label>
          <div className="schedule-owner" style={{ color: teacherColor(teacherId) }}>
            <span className="schedule-dot" style={{ background: teacherColor(teacherId) }} />
            {teacherName(teachers, teacherId)}
          </div>
        </div>
      )}

      <FormField label="日期" required error={error && !date ? error : undefined}>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <div className="form-row">
        <FormField label="开始" required>
          <input
            type="time"
            className="input"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={disabled}
          />
        </FormField>
        <FormField label="结束" required error={error && start >= end ? error : undefined}>
          <input
            type="time"
            className="input"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={disabled}
          />
        </FormField>
      </div>

      <FormField label="标题" required>
        <input
          className="input"
          value={title}
          placeholder="如：AI写作第3讲 / 一对一辅导"
          onChange={(e) => setTitle(e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <FormField label="地点">
        <input
          className="input"
          value={location}
          placeholder="如：线上会议室 / 社区教室"
          onChange={(e) => setLocation(e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <FormField label="备注">
        <textarea
          className="input"
          rows={3}
          value={note}
          placeholder="选填：说明、注意事项等"
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled}
        />
      </FormField>

      {conflictWarn && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 8,
            background: '#FFF7ED',
            border: '1px solid #FDBA74',
            color: '#9A3412',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠ 时间冲突提醒</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{conflictWarn}</div>
          <Button
            variant="danger"
            size="sm"
            disabled={saving}
            onClick={() => void handleSave(true)}
          >
            仍要保存
          </Button>
        </div>
      )}
      {error && <div className="form-error" style={{ marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
