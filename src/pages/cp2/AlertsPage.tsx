import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useRepository } from '../../hooks/useRepository';
import { db } from '../../data/repository';
import { Button, Card, EmptyState, Modal, PageHeader, Tag, Toast } from '../../components/ui';
import { CONCERN_LABEL, formatDate } from '../../lib/format';
import { useDemoMode } from '../../lib/demoMode';
import type { Concern, Student } from '../../data/types';
import {
  confirmConcern,
  convertConcernToTodo,
  resolveConcern,
  syncAlerts,
  type AlertActor,
} from '../../lib/alerts';

const STATUS_ORDER: Concern['status'][] = ['pending', 'confirmed', 'resolved'];

export default function AlertsPage() {
  const navigate = useNavigate();
  const { principal } = useAuth();
  const { readOnly } = useDemoMode();
  const actor: AlertActor = { actorId: principal?.teacherId ?? '', actorRole: 'teacher' };

  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Concern | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const scanned = useRef(false);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  // 进入页面自动扫描一次（幂等：已存在未解决 concern 不会重复生成）
  useEffect(() => {
    if (scanned.current || !actor.actorId) return;
    scanned.current = true;
    syncAlerts(db, actor).catch((e) => {
      // 扫描失败不影响页面其余展示；记录便于排查
      console.error('[alerts] 自动扫描失败', e);
    });
    // 仅执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, loading } = useRepository(['concerns', 'students'], async (d) => {
    const [concerns, students] = await Promise.all([d.concerns.list(), d.students.list()]);
    return { concerns, students };
  });

  if (loading || !data) return <div className="loading">加载中…</div>;

  const studentMap = new Map<string, Student>(data.students.map((s) => [s.id, s]));
  const nameOf = (id: string) => studentMap.get(id)?.nickname ?? id;

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: data.concerns
      .filter((c) => c.status === status)
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)),
  }));
  const total = data.concerns.length;

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await syncAlerts(db, actor);
      flash(n > 0 ? `已新增 ${n} 条预警` : '预警已是最新（无新增）');
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async (c: Concern) => {
    await confirmConcern(db, c.id, actor);
    flash('已确认');
  };

  const openResolve = (c: Concern) => {
    setResolveTarget(c);
    setResolveNote('');
  };

  const onResolve = async () => {
    if (!resolveTarget) return;
    await resolveConcern(db, resolveTarget.id, resolveNote.trim(), actor);
    setResolveTarget(null);
    flash('已解决');
  };

  const onConvert = async (c: Concern) => {
    await convertConcernToTodo(db, c, nameOf(c.student_id), actor);
    flash('已转为待办');
  };

  return (
    <>
      <PageHeader
        title="学习预警"
        desc="系统基于出勤、提交、能力评估与学习记录自动识别风险学员，教师确认与处置"
        actions={
          !readOnly && (
            <Button variant="primary" size="sm" onClick={refresh} disabled={busy}>
              刷新预警
            </Button>
          )
        }
      />

      {total === 0 ? (
        <Card>
          <EmptyState title="暂无预警" hint="进入页面已自动扫描；满足条件时将自动生成预警" />
        </Card>
      ) : (
        STATUS_ORDER.map((status) => {
          const group = grouped.find((g) => g.status === status)!;
          return (
            <section key={status}>
              <h2 className="section-title">
                {CONCERN_LABEL[status]} <span className="muted">（{group.items.length}）</span>
              </h2>
              <Card>
                {group.items.length === 0 ? (
                  <div className="empty-compact">无{CONCERN_LABEL[status]}的预警</div>
                ) : (
                  <div className="list">
                    {group.items.map((c) => (
                      <div key={c.id} className="list-item alert-row">
                        <div className="focus-main">
                          <div className="row" style={{ gap: 8 }}>
                            <strong>{c.type}</strong>
                            <Tag tone={c.status === 'resolved' ? 'success' : c.status === 'confirmed' ? 'accent' : 'danger'}>
                              {CONCERN_LABEL[c.status]}
                            </Tag>
                            <span className="muted">学员：{nameOf(c.student_id)}</span>
                          </div>
                          <div className="muted">{c.trigger_reason}</div>
                          {c.evidence && <div className="muted alert-evidence">依据：{c.evidence}</div>}
                          {c.suggested_action && (
                            <div className="muted alert-evidence">建议：{c.suggested_action}</div>
                          )}
                          {c.result && <div className="muted alert-evidence">处理结果：{c.result}</div>}
                          <div className="muted alert-evidence">生成于 {formatDate(c.created_at)}</div>
                        </div>
                        <div className="alert-actions">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/t/students/${c.student_id}`)}>
                            查看学员
                          </Button>
                          {!readOnly && c.status === 'pending' && (
                            <Button size="sm" onClick={() => onConfirm(c)}>
                              确认
                            </Button>
                          )}
                          {!readOnly && c.status !== 'resolved' && (
                            <Button size="sm" variant="primary" onClick={() => openResolve(c)}>
                              解决
                            </Button>
                          )}
                          {!readOnly && c.status !== 'resolved' && (
                            <Button size="sm" variant="ghost" onClick={() => onConvert(c)}>
                              转为待办
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          );
        })
      )}

      {/* 解决确认弹窗：处理备注写入现有 result 字段（可选） */}
      <Modal
        open={resolveTarget !== null}
        title="解决预警"
        onClose={() => setResolveTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setResolveTarget(null)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={onResolve}>
              确认解决
            </Button>
          </>
        }
      >
        {resolveTarget && (
          <div className="stack">
            <div className="muted">
              {resolveTarget.type} · {nameOf(resolveTarget.student_id)} · {resolveTarget.trigger_reason}
            </div>
            <label className="form-label">处理备注（可选，写入现有「结果」字段）</label>
            <textarea
              className="textarea"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="例如：已电话沟通，学员承诺本周补交"
              rows={3}
            />
          </div>
        )}
      </Modal>

      {toast && <Toast tone="success">{toast}</Toast>}
    </>
  );
}
