// ============================================================
// 教师编辑 / 新增弹窗
// ------------------------------------------------------------
// mode='edit'   —— 传入 teacher，编辑已有教师（姓名 / 身份 / 教学内容 / 介绍）
// mode='create' —— teacher 为 null，新增教师（仅运营管理员可用，由页面层控制）
// 新增时自动生成 t{n} 形式的 id，与种子数据 t1–t5 保持一致的命名风格。
// ============================================================
import { useEffect, useState } from 'react';
import { db } from '../data/repository';
import type { Teacher } from '../data/types';
import { Button, FormField, Modal } from './ui';

interface Props {
  open: boolean;
  teacher: Teacher | null;
  mode?: 'edit' | 'create';
  /** 已有教师 id 列表，仅 create 模式用于生成下一个不冲突的 id */
  existingIds?: string[];
  onClose: () => void;
  onSaved?: (result: Teacher) => void;
}

function nextTeacherId(existing: string[]): string {
  let n = 1;
  const used = new Set(existing);
  while (used.has(`t${n}`)) n += 1;
  return `t${n}`;
}

export function TeacherEditModal({
  open,
  teacher,
  mode = 'edit',
  existingIds = [],
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [subjects, setSubjects] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isCreate = mode === 'create';

  // 进入时把教师当前值同步进表单；新增模式则清空
  useEffect(() => {
    if (!open) return;
    if (isCreate || !teacher) {
      setName('');
      setTitle('');
      setSubjects('');
      setBio('');
    } else {
      setName(teacher.name ?? '');
      setTitle(teacher.title ?? 'AI 讲师');
      setSubjects(teacher.subjects ?? '');
      setBio(teacher.bio ?? '');
    }
    setError(null);
    setSaving(false);
  }, [open, teacher, isCreate]);

  if (!open) return null;
  if (!isCreate && !teacher) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('姓名不能为空');
      return;
    }
    if (!subjects.trim()) {
      setError('教学内容不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        title: title.trim() || 'AI 讲师',
        subjects: subjects.trim(),
        bio: bio.trim(),
      };
      if (isCreate) {
        // user_id 留空等待该教师本人注册后认领（与 seed-to-supabase 的待认领策略一致）
        const created = await db.teachers.insert({
          id: nextTeacherId(existingIds),
          user_id: '',
          ...payload,
        });
        onSaved?.(created);
      } else {
        const updated = await db.teachers.update((teacher as Teacher).id, payload);
        onSaved?.(updated);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isCreate ? '新增教师' : '编辑教师信息'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <FormField label="姓名" required>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：王老师"
            autoFocus
          />
        </FormField>
        <FormField label="身份" hint="如「AI 首席讲师」「教研主管」等职位/头衔">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="AI 讲师"
          />
        </FormField>
        <FormField label="教学内容" required hint="用 / 分隔多个方向，如「AI写作/提示词」">
          <input
            className="input"
            value={subjects}
            onChange={(e) => setSubjects(e.target.value)}
            placeholder="AI写作/提示词"
          />
        </FormField>
        <FormField label="身份介绍">
          <textarea
            className="input"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="一段简短介绍，会显示在教师卡片与登录页教师卡片下方"
            rows={4}
          />
        </FormField>
        {isCreate && (
          <div className="alert-info">
            新增教师后，其账号 <code>user_id</code> 留空，待该教师本人注册后在登录页「认领账号」填入此编号即可绑定。
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
      </div>
    </Modal>
  );
}
