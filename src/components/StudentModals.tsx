// ============================================================
// P1 学员管理 · 交互弹窗集合
// 新增学员 / 编辑档案（学员本人 or 教师内部）/ 调班 / 归档恢复。
// 所有写操作真实落地 DataLayer；学员端编辑受字段白名单约束（由服务层+Repository 双重保证）。
// 移动端自动变为底部抽屉式（见 app.css .modal-*）。
// ============================================================
import { useEffect, useState } from 'react';
import { db } from '../data/repository';
import type { ChangeActor } from '../lib/submissionStatusGuards';
import type { Attendance, AttendanceStatus, ClassRow, ClassSession, Enrollment, Student } from '../data/types';
import {
  archiveStudent,
  createStudent,
  editStudentAsSelf,
  editStudentAsTeacher,
  restoreStudent,
  transferClass,
  type CreateStudentInput,
} from '../lib/studentService';
import { ATTENDANCE_LABEL, formatDate } from '../lib/format';
import { ENROLLMENT_STATUS } from '../lib/enrollment';
import { Button, FormField, Modal } from './ui';

// —— 学员本人可改字段（与 STUDENT_SELF_EDITABLE 保持一致，仅用于表单渲染） ——
const SELF_FIELDS: { key: keyof Student; label: string; kind: 'text' | 'textarea' | 'number' | 'bool' }[] = [
  { key: 'nickname', label: '展示姓名（nickname）', kind: 'text' },
  { key: 'self_intro', label: '自我介绍', kind: 'textarea' },
  { key: 'age_range', label: '年龄段', kind: 'text' },
  { key: 'occupation', label: '职业', kind: 'text' },
  { key: 'goal', label: '学习目标', kind: 'textarea' },
  { key: 'weekly_hours', label: '每周可学习时间（小时）', kind: 'number' },
  { key: 'devices', label: '设备', kind: 'text' },
  { key: 'os', label: '系统', kind: 'text' },
  { key: 'office_software', label: '办公软件', kind: 'text' },
  { key: 'ai_tools_used', label: '常用 AI 工具', kind: 'text' },
  { key: 'can_self_service', label: '自助能力', kind: 'bool' },
  { key: 'uses_paid_ai', label: '是否使用付费 AI', kind: 'bool' },
  { key: 'contact', label: '联系方式', kind: 'text' },
];

const INTERNAL_FIELDS: { key: keyof Student; label: string; kind: 'textarea' | 'tags' | 'text' }[] = [
  { key: 'ai_baseline', label: 'AI 基线分析', kind: 'textarea' },
  { key: 'teacher_tags', label: '学员档案标签（用、或，分隔）', kind: 'tags' },
  { key: 'teacher_observation', label: '长期观察记录', kind: 'textarea' },
  { key: 'learning_suggestion', label: '学习建议（学员可见，作为后续学习建议）', kind: 'textarea' },
];

function BoolSelect({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <select className="select" value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')}>
      <option value="1">是</option>
      <option value="0">否</option>
    </select>
  );
}

// ============================================================
// 新增学员
// ============================================================
export function StudentCreateModal({
  open,
  onClose,
  onSaved,
  actor,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  actor: ChangeActor;
}) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [form, setForm] = useState({
    account: '',
    loginName: '',
    nickname: '',
    classId: '',
    age_range: '',
    occupation: '',
    goal: '',
    weekly_hours: 0,
    devices: '',
    os: '',
    office_software: '',
    ai_tools_used: '',
    self_intro: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      db.classes
        .list()
        .then((cs) => {
          setClasses(cs);
          // 班级加载完成且尚未选择时，默认预选第一个
          setForm((f) => (f.classId ? f : { ...f, classId: cs[0]?.id ?? '' }));
        })
        .catch(() => setClasses([]));
      setForm({
        account: '',
        loginName: '',
        nickname: '',
        classId: '',
        age_range: '',
        occupation: '',
        goal: '',
        weekly_hours: 0,
        devices: '',
        os: '',
        office_software: '',
        ai_tools_used: '',
        self_intro: '',
      });
      setErrors({});
      setErr('');
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.account.trim()) e.account = '登录账号必填，且需唯一';
    if (!form.loginName.trim()) e.loginName = '登录姓名（系统身份名）必填';
    if (!form.nickname.trim()) e.nickname = '展示姓名必填';
    if (!form.classId) e.classId = '请选择所属班级';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    setErr('');
    const input: CreateStudentInput = {
      account: form.account.trim(),
      loginName: form.loginName.trim(),
      nickname: form.nickname.trim(),
      classId: form.classId,
      age_range: form.age_range.trim(),
      occupation: form.occupation.trim(),
      goal: form.goal.trim(),
      weekly_hours: Number(form.weekly_hours) || 0,
      devices: form.devices.trim(),
      os: form.os.trim(),
      office_software: form.office_software.trim(),
      ai_tools_used: form.ai_tools_used.trim(),
      self_intro: form.self_intro.trim(),
    };
    try {
      await createStudent(db, actor, input);
      onSaved();
      onClose();
    } catch (ex) {
      setErr((ex as Error).message || '新增失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新增学员"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '创建学员'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 'var(--fs-secondary)', marginTop: 0 }}>
        登录账号与展示姓名必须分开：<b>登录账号</b>用于登录且唯一；<b>登录姓名</b>是系统身份名；<b>展示姓名</b>是页面显示用昵称。
      </p>
      <div className="form-grid">
        <FormField label="登录账号（唯一）" required error={errors.account}>
          <input className="input" value={form.account} onChange={(e) => set('account', e.target.value)} placeholder="如 lsf2026" />
        </FormField>
        <FormField label="登录姓名（系统身份名）" required error={errors.loginName}>
          <input className="input" value={form.loginName} onChange={(e) => set('loginName', e.target.value)} placeholder="如 林淑芬" />
        </FormField>
        <FormField label="展示姓名（nickname）" required error={errors.nickname}>
          <input className="input" value={form.nickname} onChange={(e) => set('nickname', e.target.value)} placeholder="页面显示用" />
        </FormField>
        <FormField label="所属班级" required error={errors.classId}>
          <select className="select" value={form.classId} onChange={(e) => set('classId', e.target.value)}>
            <option value="">请选择班级</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="年龄段">
          <input className="input" value={form.age_range} onChange={(e) => set('age_range', e.target.value)} placeholder="如 30-40" />
        </FormField>
        <FormField label="职业">
          <input className="input" value={form.occupation} onChange={(e) => set('occupation', e.target.value)} placeholder="如 行政文员" />
        </FormField>
        <FormField label="学习目标">
          <textarea className="textarea" value={form.goal} onChange={(e) => set('goal', e.target.value)} placeholder="希望掌握的内容" />
        </FormField>
        <FormField label="每周可学习时间（小时）">
          <input className="input" type="number" min={0} value={form.weekly_hours} onChange={(e) => set('weekly_hours', Number(e.target.value))} />
        </FormField>
        <FormField label="设备">
          <input className="input" value={form.devices} onChange={(e) => set('devices', e.target.value)} placeholder="如 笔记本" />
        </FormField>
        <FormField label="系统">
          <input className="input" value={form.os} onChange={(e) => set('os', e.target.value)} placeholder="如 Windows" />
        </FormField>
        <FormField label="办公软件">
          <input className="input" value={form.office_software} onChange={(e) => set('office_software', e.target.value)} placeholder="如 Office、WPS" />
        </FormField>
        <FormField label="常用 AI 工具">
          <input className="input" value={form.ai_tools_used} onChange={(e) => set('ai_tools_used', e.target.value)} placeholder="如 豆包、文心" />
        </FormField>
        <FormField label="自我介绍">
          <textarea className="textarea" value={form.self_intro} onChange={(e) => set('self_intro', e.target.value)} placeholder="学员自述" />
        </FormField>
      </div>
      {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ============================================================
// 编辑档案：教师（两区）或 学员本人（仅本人字段）
// ============================================================
export function StudentEditModal({
  open,
  student,
  isTeacher,
  actor,
  onClose,
  onSaved,
}: {
  open: boolean;
  student: Student | null;
  isTeacher: boolean;
  actor: ChangeActor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open && student) {
      const init: Record<string, unknown> = {};
      const keys = isTeacher
        ? [...SELF_FIELDS.map((f) => f.key), ...INTERNAL_FIELDS.map((f) => f.key)]
        : SELF_FIELDS.map((f) => f.key);
      for (const k of keys) init[k] = (student as unknown as Record<string, unknown>)[k as string] ?? (k === 'teacher_tags' ? [] : '');
      setForm(init);
      setErr('');
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!student) return;
    setSaving(true);
    setErr('');
    try {
      // 学员端：只递交本人白名单字段（Repository 守卫做最终兜底，混入非法字段整次失败）
      // 教师端：递交基本资料 + 内部档案（系统字段由 editStudentAsTeacher 过滤）
      const patch: Record<string, unknown> = {};
      const keys = isTeacher
        ? [...SELF_FIELDS.map((f) => f.key), ...INTERNAL_FIELDS.map((f) => f.key)]
        : SELF_FIELDS.map((f) => f.key);
      for (const k of keys) {
        let v = form[k];
        if (k === 'teacher_tags') v = Array.isArray(v) ? v : String(v ?? '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
        if (k === 'weekly_hours') v = Number(v) || 0;
        if (k === 'can_self_service' || k === 'uses_paid_ai') v = Boolean(v);
        patch[k] = v;
      }
      if (isTeacher) await editStudentAsTeacher(db, student.id, actor, patch as Partial<Student>);
      else await editStudentAsSelf(db, student.id, actor, patch as Partial<Student>);
      onSaved();
      onClose();
    } catch (ex) {
      setErr((ex as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!student) return null;

  return (
    <Modal
      open={open}
      title={isTeacher ? `编辑档案 · ${student.nickname}` : '编辑我的资料'}
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {SELF_FIELDS.map((f) => (
          <FormField key={f.key} label={f.label}>
            {f.kind === 'textarea' ? (
              <textarea className="textarea" value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.kind === 'number' ? (
              <input className="input" type="number" min={0} value={Number(form[f.key] ?? 0)} onChange={(e) => set(f.key, Number(e.target.value))} />
            ) : f.kind === 'bool' ? (
              <BoolSelect value={Boolean(form[f.key])} onChange={(v) => set(f.key, v)} />
            ) : (
              <input className="input" value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </FormField>
        ))}
      </div>

      {isTeacher && (
        <div className="internal-box">
          <div className="internal-head">
            <span className="internal-badge">仅教师可见</span>
            <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
              以下字段不对学员展示，也不允许学员修改
            </span>
          </div>
          <div className="form-grid">
            {INTERNAL_FIELDS.map((f) => (
              <FormField key={f.key} label={f.label}>
                {f.kind === 'tags' ? (
                  <input
                    className="input"
                    value={Array.isArray(form[f.key]) ? (form[f.key] as string[]).join('、') : String(form[f.key] ?? '')}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder="如 进度慢、需鼓励"
                  />
                ) : (
                  <textarea className="textarea" value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </FormField>
            ))}
          </div>
        </div>
      )}

      {!isTeacher && (
        <div className="form-hint" style={{ marginTop: 8 }}>
          教师给出的学习建议可在档案中查看（只读）。班级与归档状态不可自行修改。
        </div>
      )}

      {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ============================================================
// 调班
// ============================================================
export function StudentTransferModal({
  open,
  student,
  actor,
  onClose,
  onSaved,
}: {
  open: boolean;
  student: Student | null;
  actor: ChangeActor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      db.classes.list().then(setClasses).catch(() => setClasses([]));
      setTarget('');
      setErr('');
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!student) return;
    if (!target) {
      setErr('请选择目标班级');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await transferClass(db, actor, student.id, target);
      onSaved();
      onClose();
    } catch (ex) {
      setErr((ex as Error).message || '调班失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`调班 · ${student?.nickname ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '确认调班'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-secondary)' }}>
        调班将把当前在读报名转为「已转班」并保留历史，同时为该学员新增目标班级的在读报名。旧班级与历史记录不会被覆盖或删除。
      </p>
      <FormField label="目标班级" required error={err || undefined}>
        <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">请选择目标班级</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>
    </Modal>
  );
}

// ============================================================
// 归档 / 恢复（归档必须二次确认）
// ============================================================
export function StudentArchiveModal({
  open,
  student,
  actor,
  onClose,
  onSaved,
}: {
  open: boolean;
  student: Student | null;
  actor: ChangeActor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const archived = !!student?.archived_at;
  const [confirmStep, setConfirmStep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setConfirmStep(false);
      setErr('');
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!student) return;
    if (!archived && !confirmStep) {
      setConfirmStep(true);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      if (archived) await restoreStudent(db, student.id, actor);
      else await archiveStudent(db, student.id, actor);
      onSaved();
      onClose();
    } catch (ex) {
      setErr((ex as Error).message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={archived ? `恢复学员 · ${student?.nickname ?? ''}` : `归档学员 · ${student?.nickname ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            variant={archived ? 'primary' : 'danger'}
            onClick={submit}
            disabled={saving}
          >
            {saving ? '处理中…' : archived ? '确认恢复' : confirmStep ? '再次确认归档（历史数据保留）' : '归档'}
          </Button>
        </>
      }
    >
      {archived ? (
        <p style={{ marginTop: 0 }}>
          将恢复该学员为「在读」状态，其历史出勤、作业、作品、学习记录与能力评估均完整保留，恢复后可正常访问与编辑。
        </p>
      ) : (
        <div>
          <p style={{ marginTop: 0 }}>
            归档后该学员将从默认名单中隐藏，但其全部历史数据（出勤、作业、作品、学习记录、能力评估）均完整保留，教师仍可在「已归档」筛选下查看并恢复。
          </p>
          {confirmStep && (
            <div className="alert-warn">
              请再次确认：归档后该学员本人将无法登录与编辑，直到被恢复。此操作可随时撤销。
            </div>
          )}
        </div>
      )}
      {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ============================================================
// 登记出勤（教师快捷操作）：选班级 → 选场次 → 为在读学员批量登记考勤
// 已存在考勤则更新，否则插入；整组操作放入事务，任一步失败整体回滚。
// ============================================================
export function AttendanceRegisterModal({
  open,
  onClose,
  actor,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  actor: ChangeActor;
  onSaved?: () => void;
}) {
  const [classId, setClassId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [all, setAll] = useState<{
    classes: ClassRow[];
    enrollments: Enrollment[];
    sessions: ClassSession[];
    attendance: Attendance[];
    students: Student[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const [classes, enrollments, sessions, attendance, students] = await Promise.all([
        db.classes.list(),
        db.enrollments.list(),
        db.classSessions.list(),
        db.attendance.list(),
        db.students.list(),
      ]);
      if (!alive) return;
      setAll({ classes, enrollments, sessions, attendance, students });
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const classes = all?.classes ?? [];
  const enrollments = all?.enrollments ?? [];
  const sessions = all?.sessions ?? [];
  const attendance = all?.attendance ?? [];
  const students = all?.students ?? [];

  const sessionsOfClass = sessions
    .filter((s) => s.class_id === classId)
    .sort((a, b) => b.scheduled_start - a.scheduled_start);

  const enrolledStudents: Student[] = enrollments
    .filter((e) => e.class_id === classId && e.status === ENROLLMENT_STATUS.ACTIVE)
    .map((e) => students.find((s) => s.id === e.student_id))
    .filter((s): s is Student => !!s && !s.archived_at);

  // 切换班级 / 场次时，依据已有考勤预填（默认 present）
  useEffect(() => {
    if (!sessionId) {
      setStatusMap({});
      return;
    }
    const existing = new Map(
      attendance.filter((a) => a.class_session_id === sessionId).map((a) => [a.student_id, a.status]),
    );
    const init: Record<string, AttendanceStatus> = {};
    for (const st of enrolledStudents) init[st.id] = existing.get(st.id) ?? 'present';
    setStatusMap(init);
    // 仅在班级 / 场次变化时重新预填
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, classId]);

  const submit = async () => {
    setErr('');
    if (!classId || !sessionId) {
      setErr('请先选择班级与场次');
      return;
    }
    setSaving(true);
    try {
      const session = sessions.find((s) => s.id === sessionId);
      const time = session?.scheduled_start ?? Date.now();
      await db.transaction(async (tx) => {
        for (const st of enrolledStudents) {
          const status = statusMap[st.id] ?? 'present';
          const existing = attendance.find(
            (a) => a.class_session_id === sessionId && a.student_id === st.id,
          );
          if (existing) {
            await tx.attendance.update(existing.id, { status });
          } else {
            await tx.attendance.insert({
              class_session_id: sessionId,
              student_id: st.id,
              status,
              time,
              note: '',
              created_by: actor.actorId,
            } as never);
          }
        }
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登记失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="登记出勤"
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '处理中…' : '保存考勤'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormField label="选择班级" required>
          <select
            className="select"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSessionId('');
            }}
          >
            <option value="">请选择班级</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>

        {classId && (
          <FormField label="选择场次" required>
            <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">请选择场次</option>
              {sessionsOfClass.length === 0 && <option value="" disabled>该班级暂无场次</option>}
              {sessionsOfClass.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.scheduled_start)} ·{' '}
                  {s.status === 'done' ? '已上' : s.status === 'scheduled' ? '待上' : s.status === 'ongoing' ? '进行中' : '已取消'}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {sessionId && (
          <div>
            <div className="sub-label">在读学员（共 {enrolledStudents.length} 人）</div>
            {enrolledStudents.length === 0 ? (
              <div className="empty-compact">该班级暂无在读学员</div>
            ) : (
              <div className="att-register-list">
                {enrolledStudents.map((st) => (
                  <div key={st.id} className="att-register-row">
                    <span className="att-register-name">{st.nickname}</span>
                    <div className="att-register-opts">
                      {(['present', 'late', 'leave', 'absent'] as AttendanceStatus[]).map((s) => (
                        <label
                          key={s}
                          className={`att-opt att-opt--${s}${statusMap[st.id] === s ? ' att-opt--on' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`att-${st.id}`}
                            checked={statusMap[st.id] === s}
                            onChange={() => setStatusMap((p) => ({ ...p, [st.id]: s }))}
                          />
                          {ATTENDANCE_LABEL[s]}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
      </div>
    </Modal>
  );
}

// ============================================================
// 添加教师观察（教师快捷操作）：选学员 → 选场次 → 记录 teacher_observation / next_suggestion
// 写入 learning_records，真实落地；不绑定作业，作为课堂/阶段观察留痕。
// ============================================================
export function TeacherObservationModal({
  open,
  onClose,
  actor,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  actor: ChangeActor;
  onSaved?: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [observation, setObservation] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [all, setAll] = useState<{
    students: Student[];
    enrollments: Enrollment[];
    sessions: ClassSession[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const [students, enrollments, sessions] = await Promise.all([
        db.students.list(),
        db.enrollments.list(),
        db.classSessions.list(),
      ]);
      if (!alive) return;
      setAll({ students, enrollments, sessions });
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const activeStudents = (all?.students ?? []).filter((s) => !s.archived_at);
  const activeClassOf = (sid: string) => {
    const en = (all?.enrollments ?? []).find(
      (e) => e.student_id === sid && e.status === ENROLLMENT_STATUS.ACTIVE,
    );
    return en?.class_id ?? '';
  };
  const sessionsOfStudent = studentId
    ? (all?.sessions ?? [])
        .filter((s) => s.class_id === activeClassOf(studentId))
        .sort((a, b) => b.scheduled_start - a.scheduled_start)
    : [];

  const submit = async () => {
    setErr('');
    if (!studentId) {
      setErr('请选择学员');
      return;
    }
    if (!sessionId) {
      setErr('请选择关联场次');
      return;
    }
    if (!observation.trim() && !suggestion.trim()) {
      setErr('请至少填写一项观察或下一步建议');
      return;
    }
    setSaving(true);
    try {
      await db.learningRecords.insert({
        student_id: studentId,
        class_session_id: sessionId,
        prep: '—',
        exercise_completion: '—',
        tools: '',
        key_prompts: '',
        problems: '',
        need_help: false,
        teacher_observation: observation.trim(),
        ai_analysis_ref: null,
        next_suggestion: suggestion.trim(),
        submission_id: null,
        created_by: actor.actorId,
      } as never);
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="添加教师观察"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '处理中…' : '保存观察'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormField label="选择学员" required>
          <select
            className="select"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setSessionId('');
            }}
          >
            <option value="">请选择学员</option>
            {activeStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nickname}
              </option>
            ))}
          </select>
        </FormField>

        {studentId && (
          <FormField label="关联场次" required hint="观察将记录到该学员所在班级的某次课（作为课堂/阶段观察留痕）">
            <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">请选择场次</option>
              {sessionsOfStudent.length === 0 && <option value="" disabled>该学员所在班级暂无场次</option>}
              {sessionsOfStudent.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.scheduled_start)} ·{' '}
                  {s.status === 'done' ? '已上' : s.status === 'scheduled' ? '待上' : s.status === 'ongoing' ? '进行中' : '已取消'}
                </option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label="观察记录" hint="教师内部可见，记录课堂表现、状态与判断">
          <textarea
            className="textarea"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="例如：本节课思路清晰，但提示词拆解仍需加强…"
          />
        </FormField>

        <FormField label="下一步教学建议" hint="给该学员的后续学习方向">
          <textarea
            className="textarea"
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="例如：下周重点练习需求拆解与结构化提示词…"
          />
        </FormField>

        {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
      </div>
    </Modal>
  );
}
