import { useEffect, useState, type CSSProperties } from 'react';
import { db } from '../data/repository';
import type { ChangeActor } from '../lib/submissionStatusGuards';
import type { Teacher, TeacherSchedule } from '../data/types';
import { Modal, FormField, Button } from './ui';
import {
  WEEKDAYS,
  parseDate,
  formatDate,
  eachDayInRange,
  teacherColor,
  teacherName,
} from '../lib/schedule';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 已有排班（用于冲突检测 / 清理命中，需传全量） */
  existing: TeacherSchedule[];
  teachers: Teacher[];
  currentUserId: string;
  currentRole: 'teacher' | 'student' | 'admin';
  /** 是否允许自选多位老师（admin）；普通老师锁定本人 */
  canPickTeacher: boolean;
  /** 不可自选时锁定归属老师 */
  defaultTeacherId: string;
  /** 保存成功后回调（页面刷新 + 提示） */
  onSaved?: () => void;
}

type Repeat = 'daily' | 'weekdays' | 'custom';
type Conflict = 'skip' | 'overwrite';
type Mode = 'generate' | 'clear';

export function ScheduleBatchModal({
  open,
  onClose,
  existing,
  teachers,
  currentUserId,
  currentRole,
  canPickTeacher,
  defaultTeacherId,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<Mode>('generate');
  const [teacherIds, setTeacherIds] = useState<string[]>([defaultTeacherId]);
  const [startDate, setStartDate] = useState(formatDate(new Date()));
  const [endDate, setEndDate] = useState(formatDate(new Date(Date.now() + 14 * 86400000)));
  const [repeat, setRepeat] = useState<Repeat>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([3]); // 默认周三
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('21:00');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [conflict, setConflict] = useState<Conflict>('skip');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult('');
    setMode('generate');
    setTeacherIds(canPickTeacher ? [] : [defaultTeacherId]);
    setStartDate(formatDate(new Date()));
    setEndDate(formatDate(new Date(Date.now() + 14 * 86400000)));
    setRepeat('daily');
    setWeekdays([3]);
    setStart('19:00');
    setEnd('21:00');
    setTitle('');
    setLocation('');
    setNote('');
    setConflict('skip');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canPickTeacher, defaultTeacherId]);

  function toggleTeacher(id: string) {
    setTeacherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleWeekday(wd: number) {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]));
  }

  /** 当前筛选条件（老师 × 日期区间 × 星期规律）命中的已有排班 */
  function matchedSchedules(): TeacherSchedule[] {
    const targets = canPickTeacher ? teacherIds : [defaultTeacherId];
    if (targets.length === 0) return [];
    if (!startDate || !endDate) return [];
    if (parseDate(startDate) > parseDate(endDate)) return [];
    const days = new Set(eachDayInRange(startDate, endDate));
    return existing.filter((s) => {
      if (!targets.includes(s.teacher_id)) return false;
      if (!days.has(s.schedule_date)) return false;
      const wd = parseDate(s.schedule_date).getDay();
      if (repeat === 'weekdays' && (wd === 0 || wd === 6)) return false;
      if (repeat === 'custom' && !weekdays.includes(wd)) return false;
      return true;
    });
  }

  async function handleGenerate() {
    setError('');
    setResult('');
    const targets = canPickTeacher ? teacherIds : [defaultTeacherId];
    if (targets.length === 0) return setError('请至少选择一位老师');
    if (!startDate || !endDate) return setError('请选择起止日期');
    if (parseDate(startDate) > parseDate(endDate)) return setError('开始日期不能晚于结束日期');
    if (repeat === 'custom' && weekdays.length === 0) return setError('请至少选择一个星期');
    if (!title.trim()) return setError('请填写排课标题');
    if (start >= end) return setError('结束时间需晚于开始时间');

    const days = eachDayInRange(startDate, endDate);
    if (days.length === 0) return setError('日期区间无效');

    const actor: ChangeActor = {
      actorRole: currentRole === 'student' ? 'student' : 'teacher',
      actorId: currentUserId,
    };

    setSaving(true);
    try {
      let created = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const tid of targets) {
        for (const ds of days) {
          const wd = parseDate(ds).getDay();
          if (repeat === 'weekdays' && (wd === 0 || wd === 6)) continue;
          if (repeat === 'custom' && !weekdays.includes(wd)) continue;
          const found = existing.find((s) => s.teacher_id === tid && s.schedule_date === ds);
          const payload = {
            teacher_id: tid,
            schedule_date: ds,
            start_time: start,
            end_time: end,
            title: title.trim(),
            location: location.trim(),
            note: note.trim(),
          };
          if (found) {
            if (conflict === 'skip') {
              skipped++;
              continue;
            }
            await db.teacherSchedules.update(found.id, payload, actor);
            overwritten++;
          } else {
            await db.teacherSchedules.insert({ ...payload, created_by: currentUserId }, actor);
            created++;
          }
        }
      }
      const parts = [`新增 ${created} 条`];
      if (overwritten) parts.push(`覆盖 ${overwritten} 条`);
      if (skipped) parts.push(`跳过 ${skipped} 条（当天已有）`);
      setResult(`批量生成完成：${parts.join('，')}。`);
      onSaved?.();
    } catch (e) {
      const msg = (e as Error).message || '生成失败';
      if (/row-level security|policy|permission|denied|42501/i.test(msg)) {
        setError('生成被拒绝：当前账号没有写入权限。演示模式为只读，请用真实教师或管理员账号登录。');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setError('');
    setResult('');
    const targets = canPickTeacher ? teacherIds : [defaultTeacherId];
    if (targets.length === 0) return setError('请至少选择一位老师');
    if (!startDate || !endDate) return setError('请选择起止日期');
    if (parseDate(startDate) > parseDate(endDate)) return setError('开始日期不能晚于结束日期');
    if (repeat === 'custom' && weekdays.length === 0) return setError('请至少选择一个星期');

    const hits = matchedSchedules();
    if (hits.length === 0) return setError('该范围内没有匹配的排班，无需清理');
    if (!window.confirm(`确认删除选中的 ${hits.length} 条排班？此操作不可恢复。`)) return;

    setSaving(true);
    try {
      let removed = 0;
      for (const s of hits) {
        await db.teacherSchedules.remove(s.id);
        removed++;
      }
      setResult(`批量清理完成：已删除 ${removed} 条排班。`);
      onSaved?.();
    } catch (e) {
      const msg = (e as Error).message || '删除失败';
      if (/row-level security|policy|permission|denied|42501/i.test(msg)) {
        setError('删除被拒绝：当前账号没有删除权限。演示模式为只读，请用真实教师或管理员账号登录。');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving;
  const clearHits = mode === 'clear' ? matchedSchedules() : [];

  return (
    <Modal
      open={open}
      title={mode === 'generate' ? '批量生成排班' : '批量清理排班'}
      onClose={onClose}
      width={620}
      footer={
        result ? (
          <Button onClick={onClose}>关闭</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={saving}>
              取消
            </Button>
            {mode === 'generate' ? (
              <Button variant="primary" onClick={handleGenerate} disabled={saving}>
                {saving ? '生成中…' : '一键生成'}
              </Button>
            ) : (
              <Button variant="danger" onClick={handleClear} disabled={saving}>
                {saving ? '删除中…' : '确认删除'}
              </Button>
            )}
          </>
        )
      }
    >
      {/* 操作模式 */}
      <FormField label="操作模式">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span onClick={() => setMode('generate')} style={chipStyle(mode === 'generate')}>
            批量生成
          </span>
          <span onClick={() => setMode('clear')} style={chipStyle(mode === 'clear', '#EB5757')}>
            批量清理（删除）
          </span>
        </div>
      </FormField>

      {/* 老师选择 */}
      {canPickTeacher ? (
        <FormField label="选择老师（可多选）" required>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              onClick={() => setTeacherIds(teachers.map((t) => t.id))}
              style={chipStyle(teacherIds.length === teachers.length)}
            >
              全部老师
            </span>
            {teachers.map((t) => (
              <span
                key={t.id}
                onClick={() => toggleTeacher(t.id)}
                style={chipStyle(teacherIds.includes(t.id), teacherColor(t.id))}
              >
                {t.name}
              </span>
            ))}
          </div>
        </FormField>
      ) : (
        <div className="form-field">
          <label className="form-label">归属老师</label>
          <div className="schedule-owner" style={{ color: teacherColor(defaultTeacherId) }}>
            <span className="schedule-dot" style={{ background: teacherColor(defaultTeacherId) }} />
            {teacherName(teachers, defaultTeacherId)}
          </div>
        </div>
      )}

      {/* 日期范围 */}
      <div className="form-row">
        <FormField label="开始日期" required>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={disabled}
          />
        </FormField>
        <FormField label="结束日期" required>
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={disabled}
          />
        </FormField>
      </div>

      {/* 重复规律 */}
      <FormField label="重复规律">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span onClick={() => setRepeat('daily')} style={chipStyle(repeat === 'daily')}>
            每天
          </span>
          <span onClick={() => setRepeat('weekdays')} style={chipStyle(repeat === 'weekdays')}>
            仅工作日
          </span>
          <span onClick={() => setRepeat('custom')} style={chipStyle(repeat === 'custom')}>
            指定星期
          </span>
        </div>
        {repeat === 'custom' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {WEEKDAYS.map((w, i) => (
              <span
                key={i}
                onClick={() => toggleWeekday(i)}
                style={chipStyle(weekdays.includes(i), i === 0 || i === 6 ? '#EB5757' : undefined)}
              >
                周{w}
              </span>
            ))}
          </div>
        )}
      </FormField>

      {mode === 'generate' ? (
        <>
          {/* 统一时间 */}
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
            <FormField label="结束" required>
              <input
                type="time"
                className="input"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={disabled}
              />
            </FormField>
          </div>

          {/* 统一内容 */}
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
              rows={2}
              value={note}
              placeholder="选填：说明、注意事项等"
              onChange={(e) => setNote(e.target.value)}
              disabled={disabled}
            />
          </FormField>

          {/* 冲突处理 */}
          <FormField label="当天已有排班时">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span onClick={() => setConflict('skip')} style={chipStyle(conflict === 'skip')}>
                跳过不重复
              </span>
              <span onClick={() => setConflict('overwrite')} style={chipStyle(conflict === 'overwrite')}>
                覆盖原内容
              </span>
            </div>
          </FormField>
        </>
      ) : (
        /* 清理预览 */
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 8,
            background: '#FEF3F2',
            border: '1px solid #FECACA',
            color: '#7F1D1D',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            将删除 {clearHits.length} 条排班
            {clearHits.length > 0 && (
              <span style={{ fontWeight: 400 }}>
                （{new Set(clearHits.map((s) => s.teacher_id)).size} 位老师 · {startDate} ~ {endDate}）
              </span>
            )}
          </div>
          {clearHits.length === 0 ? (
            <div style={{ fontSize: 13 }}>当前条件下没有匹配的排班，无需清理。</div>
          ) : (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {clearHits.slice(0, 5).map((s) => (
                <li key={s.id}>
                  {s.schedule_date} · {teacherName(teachers, s.teacher_id)} · {s.start_time}–
                  {s.end_time} · {s.title}
                </li>
              ))}
              {clearHits.length > 5 && <li>…等共 {clearHits.length} 条</li>}
            </ul>
          )}
          <div style={{ marginTop: 8, fontSize: 13, color: '#B42318' }}>
            删除不可恢复，请确认范围无误后再执行。
          </div>
        </div>
      )}

      {error && (
        <div className="form-error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      {result && (
        <div className="alert-info" style={{ marginTop: 8 }}>
          {result}
        </div>
      )}
    </Modal>
  );
}

function chipStyle(active: boolean, color?: string): CSSProperties {
  const c = color ?? '#FF7A1A';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${active ? c : '#E2E2E2'}`,
    background: active ? `${c}1A` : '#fff',
    color: active ? c : '#444',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    userSelect: 'none',
  };
}
