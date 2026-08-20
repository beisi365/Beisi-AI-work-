import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Button, Card, EmptyState, LoadingState, PageHeader, Tag, Toast } from '../components/ui';
import { getStudentsWithClass } from '../lib/queries';
import type { Student } from '../data/types';
import type { ChangeActor } from '../lib/submissionStatusGuards';
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  rateText,
  type StudentCategory,
} from '../lib/format';
import {
  StudentArchiveModal,
  StudentCreateModal,
  StudentEditModal,
  StudentTransferModal,
} from '../components/StudentModals';
import { StudentImportModal } from '../components/StudentImportModal';
import { useDemoMode } from '../lib/demoMode';

const CATEGORY_OPTIONS: { value: StudentCategory; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'behind', label: '需关注' },
  { value: 'progress', label: '进步明显' },
  { value: 'strong', label: '基础较强' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '在读' },
  { value: 'archived', label: '已归档' },
  { value: 'all', label: '全部' },
];

export default function StudentsListPage() {
  const navigate = useNavigate();
  const { principal } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const classFilter = searchParams.get('class') ?? '';
  const catFilter = (searchParams.get('cat') as StudentCategory | '') ?? '';
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [nameSearch, setNameSearch] = useState('');
  const [toast, setToast] = useState('');
  const { readOnly } = useDemoMode();

  // 弹窗状态
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [transferTarget, setTransferTarget] = useState<Student | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);

  const actor: ChangeActor = { actorId: principal?.teacherId ?? '', actorRole: 'teacher' };

  const updateFilter = (key: 'class' | 'cat', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  // 始终拉取含归档数据，页面内按状态筛选；写库后 useRepository 自动刷新
  const { data, loading } = useRepository(
    ['students', 'enrollments', 'classes'],
    async (db) => getStudentsWithClass(db, { includeArchived: true }),
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  const classOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(
      new Map(
        data
          .map((d) => d.classRow)
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => [c.id, c]),
      ).values(),
    ).map((c) => ({ id: c.id, name: c.name }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const kw = nameSearch.trim().toLowerCase();
    return data
      .filter((d) => {
        if (classFilter && d.classRow?.id !== classFilter) return false;
        if (catFilter && d.category !== catFilter) return false;
        if (statusFilter === 'active' && d.student.archived_at) return false;
        if (statusFilter === 'archived' && !d.student.archived_at) return false;
        if (kw && !d.student.nickname.toLowerCase().includes(kw)) return false;
        return true;
      })
      .sort((a, b) => {
        // 在读优先，已归档置后
        const ax = a.student.archived_at ? 1 : 0;
        const bx = b.student.archived_at ? 1 : 0;
        if (ax !== bx) return ax - bx;
        return a.student.nickname.localeCompare(b.student.nickname, 'zh');
      });
  }, [data, classFilter, catFilter, statusFilter, nameSearch]);

  if (loading || !data) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="学员档案"
        desc="新增、筛选与维护学员资料；归档学员默认隐藏，可在「已归档」下查看与恢复"
        actions={
          !readOnly && (
            <>
              <Button variant="ghost" onClick={() => setImportOpen(true)}>
                批量导入
              </Button>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                + 新增学员
              </Button>
            </>
          )
        }
      />

      <div className="filters">
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'archived' | 'all')}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select className="select" value={classFilter} onChange={(e) => updateFilter('class', e.target.value)}>
          <option value="">全部班级</option>
          {classOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select className="select" value={catFilter} onChange={(e) => updateFilter('cat', e.target.value)}>
          <option value="">全部类别</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ flex: '1 1 160px', minWidth: 140 }}
          placeholder="搜索学员姓名…"
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
        />
      </div>

      <Card title={`学员列表（${filtered.length}）`}>
        {filtered.length === 0 ? (
          <EmptyState title="没有符合条件的学员" hint="试试调整上面的筛选条件，或新增一名学员" />
        ) : (
          <table className="stable">
            <thead>
              <tr>
                <th>学员</th>
                <th>类别</th>
                <th>班级</th>
                <th>出勤率</th>
                <th>提交率</th>
                <th>完成率</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.student.id} className="clickable" onClick={() => navigate(`/t/students/${d.student.id}`)}>
                  <td data-label="学员">
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar name={d.student.nickname} />
                      <div>
                        <strong>{d.student.nickname}</strong>
                        {d.student.archived_at && (
                          <Tag tone="neutral" style={{ marginLeft: 6 }}>
                            已归档
                          </Tag>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="类别">
                    <Tag tone={CATEGORY_TONE[d.category]}>{CATEGORY_LABEL[d.category]}</Tag>
                  </td>
                  <td data-label="班级" className="muted">
                    {d.classRow?.name ?? '未分班'}
                  </td>
                  <td data-label="出勤率">{rateText(d.attendanceRate)}</td>
                  <td data-label="提交率">{rateText(d.submissionRate)}</td>
                  <td data-label="完成率">{rateText(d.completionRate)}</td>
                  <td data-label="操作" onClick={(e) => e.stopPropagation()}>
                    {!readOnly && (
                      <div className="list-actions">
                        <Button size="sm" variant="ghost" onClick={() => setEditTarget(d.student)}>
                          编辑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setTransferTarget(d.student)}>
                          调班
                        </Button>
                        <Button
                          size="sm"
                          variant={d.student.archived_at ? 'primary' : 'danger'}
                          onClick={() => setArchiveTarget(d.student)}
                        >
                          {d.student.archived_at ? '恢复' : '归档'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <StudentCreateModal
        open={createOpen}
        actor={actor}
        onClose={() => setCreateOpen(false)}
        onSaved={() => flash('已新增学员')}
      />
      <StudentImportModal
        open={importOpen}
        actor={actor}
        onClose={() => setImportOpen(false)}
        onSaved={() => flash('批量导入完成')}
      />
      <StudentEditModal
        open={!!editTarget}
        student={editTarget}
        isTeacher
        actor={actor}
        onClose={() => setEditTarget(null)}
        onSaved={() => flash('档案已更新')}
      />
      <StudentTransferModal
        open={!!transferTarget}
        student={transferTarget}
        actor={actor}
        onClose={() => setTransferTarget(null)}
        onSaved={() => flash('调班成功')}
      />
      <StudentArchiveModal
        open={!!archiveTarget}
        student={archiveTarget}
        actor={actor}
        onClose={() => setArchiveTarget(null)}
        onSaved={() => flash('操作成功')}
      />

      {toast && <Toast tone="success">{toast}</Toast>}
    </>
  );
}
