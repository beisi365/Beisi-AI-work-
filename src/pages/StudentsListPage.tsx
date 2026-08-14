import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { Avatar, Card, EmptyState, LoadingState, PageHeader, Tag } from '../components/ui';
import { getStudentsWithClass } from '../lib/queries';
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  rateText,
  type StudentCategory,
} from '../lib/format';

const CATEGORY_OPTIONS: { value: StudentCategory; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'behind', label: '需关注' },
  { value: 'progress', label: '进步明显' },
  { value: 'strong', label: '基础较强' },
];

export default function StudentsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 筛选条件写入 URL（replace），进入档案再返回可保留
  const classFilter = searchParams.get('class') ?? '';
  const catFilter = (searchParams.get('cat') as StudentCategory | '') ?? '';

  const updateFilter = (key: 'class' | 'cat', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const { data, loading } = useRepository(
    ['students', 'enrollments', 'classes'],
    async (db) => getStudentsWithClass(db),
  );

  if (loading || !data) return <LoadingState />;

  const classOptions = Array.from(
    new Map(
      data
        .map((d) => d.classRow)
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => [c.id, c]),
    ).values(),
  ).map((c) => ({ id: c.id, name: c.name }));

  const filtered = data.filter((d) => {
    if (classFilter && d.classRow?.id !== classFilter) return false;
    if (catFilter && d.category !== catFilter) return false;
    return true;
  });

  return (
    <>
      <PageHeader title="学员档案" desc="按班级与学习状态筛选，点开任意学员查看完整档案" />

      <div className="filters">
        <select className="select" value={classFilter} onChange={(e) => updateFilter('class', e.target.value)}>
          <option value="">全部班级</option>
          {classOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={catFilter}
          onChange={(e) => updateFilter('cat', e.target.value)}
        >
          <option value="">全部类别</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Card title={`学员列表（${filtered.length}）`}>
        {filtered.length === 0 ? (
          <EmptyState title="没有符合条件的学员" hint="试试调整上面的筛选条件" />
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.student.id}
                  className="clickable"
                  onClick={() => navigate(`/t/students/${d.student.id}`)}
                >
                  <td data-label="学员">
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar name={d.student.nickname} />
                      <strong>{d.student.nickname}</strong>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
