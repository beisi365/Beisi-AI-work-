// ============================================================
// 教师编辑弹窗（演示用：仅做身份/教学内容/身份介绍/姓名的本地编辑）
// ============================================================
import { useEffect, useState } from 'react';
import { db } from '../data/repository';
import type { Teacher } from '../data/types';
import { Button, FormField, Modal } from './ui';

interface Props {
  open: boolean;
  teacher: Teacher | null;
  onClose: () => void;
  onSaved?: (updated: Teacher) => void;
}

export function TeacherEditModal({ open, teacher, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [subjects, setSubjects] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 进入时把教师当前值同步进表单
  useEffect(() => {
    if (!open || !teacher) return;
    setName(teacher.name ?? '');
    setTitle(teacher.title ?? 'AI 讲师');
    setSubjects(teacher.subjects ?? '');
    setBio(teacher.bio ?? '');
    setError(null);
    setSaving(false);
  }, [open, teacher]);

  if (!open || !teacher) return null;

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
      const updated = await db.teachers.update(teacher.id, {
        name: name.trim(),
        title: title.trim() || 'AI 讲师',
        subjects: subjects.trim(),
        bio: bio.trim(),
      });
      onSaved?.(updated);
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
      title="编辑教师信息"
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
            placeholder="一段简短介绍，会显示在登录页教师卡片下方"
            rows={4}
          />
        </FormField>
        {error && <div className="form-error">{error}</div>}
      </div>
    </Modal>
  );
}