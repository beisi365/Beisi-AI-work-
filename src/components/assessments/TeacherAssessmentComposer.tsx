import { useCallback, useEffect, useState } from 'react';
import { db } from '../../data/repository';
import { useAuth } from '../../auth/AuthContext';
import { useRepository } from '../../hooks/useRepository';
import { PageHeader, Card, Button, Tag, EmptyState, Grid, SectionTitle } from '../../components/ui';
import { ABILITY_LABEL, LEVEL_LABEL, formatDate } from '../../lib/format';
import type { AbilityAssessment, AbilityDimension, AbilityLevel, AssessmentStatus } from '../../data/types';
import {
  ALL_DIMENSIONS,
  listAssessmentGroups,
  getLegacyAssessments,
  createAssessmentGroup,
  confirmAssessmentGroup,
  publishAssessmentGroup,
  voidAssessmentGroup,
  reviseAssessmentGroup,
  isEvidenceComplete,
  type AssessmentGroupSummary,
} from '../../lib/assessments';

const LEVELS: AbilityLevel[] = ['L1', 'L2', 'L3', 'L4'];

const STATUS_META: Record<AssessmentStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' }> = {
  draft: { label: '草稿', tone: 'neutral' },
  confirmed: { label: '已确认', tone: 'accent' },
  published: { label: '已发布', tone: 'success' },
  voided: { label: '已作废', tone: 'danger' },
};

type DimVal = { level: AbilityLevel | null; evidence_text: string };

function DimCard({
  d,
  val,
  onChange,
}: {
  d: AbilityDimension;
  val: DimVal;
  onChange: (patch: Partial<DimVal>) => void;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="field-label" style={{ marginBottom: 6 }}>
        {ABILITY_LABEL[d]}
      </div>
      <select
        className="select"
        value={val.level ?? ''}
        onChange={(e) => onChange({ level: e.target.value ? (e.target.value as AbilityLevel) : null })}
      >
        <option value="">请选择等级</option>
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {l} {LEVEL_LABEL[l]}
          </option>
        ))}
      </select>
      <textarea
        className="textarea"
        style={{ marginTop: 8 }}
        placeholder="事实证据说明（关联作品/课堂观察等）"
        value={val.evidence_text}
        onChange={(e) => onChange({ evidence_text: e.target.value })}
      />
    </div>
  );
}

// 教师端能力评估核心组件：正式入口与开发隐藏路由共用，避免两套业务逻辑。
// devMode=true 时显示“内部开发页”提示（仅开发环境可见），false 为正式入口。
export function TeacherAssessmentComposer({ devMode = false }: { devMode?: boolean }) {
  const { principal } = useAuth();
  const students = useRepository(['students'], (d) => d.students.list());
  const [studentId, setStudentId] = useState('');
  const [groups, setGroups] = useState<AssessmentGroupSummary[]>([]);
  const [legacy, setLegacy] = useState<AbilityAssessment[]>([]);
  const [form, setForm] = useState<Record<AbilityDimension, DimVal>>(() =>
    Object.fromEntries(
      ALL_DIMENSIONS.map((d) => [d, { level: null, evidence_text: '' }]),
    ) as Record<AbilityDimension, DimVal>,
  );
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);

  // 移动端判定（<=760px 与侧栏隐藏断点一致）
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // 默认选中第一个学员
  useEffect(() => {
    if (!studentId && students.data && students.data.length) {
      setStudentId(students.data[0].id);
    }
  }, [students.data, studentId]);

  // 切换学员时重置表单与向导
  useEffect(() => {
    setForm(
      Object.fromEntries(
        ALL_DIMENSIONS.map((d) => [d, { level: null, evidence_text: '' }]),
      ) as Record<AbilityDimension, DimVal>,
    );
    setStep(0);
    setPreview(false);
  }, [studentId]);

  const reload = useCallback(async () => {
    if (!studentId) {
      setGroups([]);
      setLegacy([]);
      return;
    }
    setGroups(await listAssessmentGroups(db, { studentId, includeVoided: true }));
    setLegacy(await getLegacyAssessments(db, studentId));
  }, [studentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        await reload();
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const saveDraft = () =>
    run(async () => {
      const dims = ALL_DIMENSIONS.map((d) => ({
        dimension: d,
        level: form[d].level,
        source: 'teacher' as const,
        evidence_text: form[d].evidence_text,
      }));
      await createAssessmentGroup(db, {
        studentId,
        teacherId: principal?.userId ?? 'u_t1',
        dims,
      });
    });

  // 已完成 = 已主动选择等级且具备证据（与确认门槛一致）
  const completed = ALL_DIMENSIONS.filter((d) => form[d].level != null && isEvidenceComplete(form[d])).length;

  // 确认门槛：草稿 + 六维齐全 + 每维主动选择等级 + 每维有证据
  const canConfirm = (g: AssessmentGroupSummary) =>
    g.status === 'draft' &&
    ALL_DIMENSIONS.every((d) => g.dims[d]) &&
    ALL_DIMENSIONS.every((d) => g.dims[d]!.level != null) &&
    ALL_DIMENSIONS.every((d) => isEvidenceComplete(g.dims[d] ?? {}));

  return (
    <div>
      <PageHeader
        title={devMode ? '能力评估 · 内部开发页（CP2.1）' : '能力评估'}
        desc={
          devMode
            ? '仅开发环境可见，不进入正式导航。演示整组原子流转：草稿 → 确认 → 发布 → 修正（旧组在新版发布成功时作废）。'
            : '为学员录入六维能力评估。草稿可部分完成，确认前须六维齐全、每维主动选择等级且具备事实证据；新版本发布成功时旧版本自动作废。'
        }
      />

      <Card title="选择学员">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <select className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">— 请选择 —</option>
            {(students.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nickname}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {!studentId ? (
        <Card>
          <EmptyState title="未选择学员" hint="请选择一名学员后录入能力评估。" />
        </Card>
      ) : (
        <>
          <Card
            title="新建评估组（草稿）"
            desc={`六维共用一组 ID；draft 允许维度未完成，确认前须六维齐全、每维主动选择等级且具备事实证据。已完成 ${completed}/6`}
          >
            {isMobile ? (
              <div>
                <div className="muted" style={{ marginBottom: 8 }}>
                  第 {step + 1} / 6 维：{ABILITY_LABEL[ALL_DIMENSIONS[step]]}
                </div>
                <DimCard
                  d={ALL_DIMENSIONS[step]}
                  val={form[ALL_DIMENSIONS[step]]}
                  onChange={(patch) =>
                    setForm((f) => ({ ...f, [ALL_DIMENSIONS[step]]: { ...f[ALL_DIMENSIONS[step]], ...patch } }))
                  }
                />
                {!preview ? (
                  <div
                    style={{
                      position: 'sticky',
                      bottom: 64,
                      display: 'flex',
                      gap: 8,
                      background: 'var(--color-bg)',
                      padding: '10px 0',
                      borderTop: '1px solid var(--color-border)',
                      marginTop: 12,
                      zIndex: 9,
                    }}
                  >
                    <Button size="sm" variant="ghost" disabled={busy || step === 0} onClick={() => setStep((s) => s - 1)}>
                      上一步
                    </Button>
                    <Button size="sm" variant="primary" disabled={busy} onClick={saveDraft}>
                      保存草稿
                    </Button>
                    {step < 5 ? (
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => setStep((s) => s + 1)}>
                        下一步
                      </Button>
                    ) : (
                      <Button size="sm" variant="default" disabled={busy} onClick={() => setPreview(true)}>
                        预览
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="muted" style={{ margin: '8px 0' }}>
                      最终预览（共 {completed}/6 已完成）
                    </div>
                    {ALL_DIMENSIONS.map((d) => (
                      <div key={d} className="field" style={{ marginBottom: 6 }}>
                        <div className="field-label">
                          {ABILITY_LABEL[d]} · {form[d].level ? `${form[d].level} ${LEVEL_LABEL[form[d].level]}` : '请选择等级'}
                        </div>
                        <div className="field-value muted">
                          {form[d].evidence_text && form[d].evidence_text.trim() ? form[d].evidence_text : '（无事实证据）'}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPreview(false)}>
                        返回编辑
                      </Button>
                      <Button size="sm" variant="primary" disabled={busy} onClick={saveDraft}>
                        保存草稿
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Grid min={220}>
                  {ALL_DIMENSIONS.map((d) => (
                    <DimCard
                      key={d}
                      d={d}
                      val={form[d]}
                      onChange={(patch) => setForm((f) => ({ ...f, [d]: { ...f[d], ...patch } }))}
                    />
                  ))}
                </Grid>
                <div className="row" style={{ marginTop: 12 }}>
                  <Button variant="primary" size="sm" disabled={busy} onClick={saveDraft}>
                    保存为草稿（已完成 {completed}/6）
                  </Button>
                </div>
              </>
            )}
          </Card>

          <SectionTitle>评估组（按时间倒序）</SectionTitle>
          {groups.length === 0 ? (
            <Card>
              <EmptyState title="暂无评估组" hint="该学员还没有分组评估记录；可在上方新建。" />
            </Card>
          ) : (
            groups.map((g) => (
              <Card
                key={g.groupId}
                title={
                  <span>
                    <Tag tone={STATUS_META[g.status].tone}>{STATUS_META[g.status].label}</Tag>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {g.groupId} · {formatDate(g.createdAt)}
                    </span>
                  </span>
                }
                actions={
                  <div className="row" style={{ gap: 8 }}>
                    {g.status === 'draft' && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy || !canConfirm(g)}
                          onClick={() => run(() => confirmAssessmentGroup(db, g.groupId))}
                        >
                          确认
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => voidAssessmentGroup(db, g.groupId))}>
                          作废
                        </Button>
                      </>
                    )}
                    {g.status === 'confirmed' && (
                      <>
                        <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => publishAssessmentGroup(db, g.groupId))}>
                          发布
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => voidAssessmentGroup(db, g.groupId))}>
                          作废
                        </Button>
                      </>
                    )}
                    {g.status === 'published' && (
                      <Button size="sm" variant="default" disabled={busy} onClick={() => run(() => reviseAssessmentGroup(db, g.groupId))}>
                        修正（新建草稿组）
                      </Button>
                    )}
                  </div>
                }
              >
                <Grid min={220}>
                  {ALL_DIMENSIONS.map((d) =>
                    g.dims[d] ? (
                      <div key={d} className="field" style={{ marginBottom: 6 }}>
                        <div className="field-label">
                          {ABILITY_LABEL[d]} ·{' '}
                          {g.dims[d]!.level ? `${g.dims[d]!.level} ${LEVEL_LABEL[g.dims[d]!.level]}` : '请选择等级'}
                        </div>
                        <div className="field-value muted">
                          {g.dims[d]!.evidence_text && g.dims[d]!.evidence_text.trim()
                            ? g.dims[d]!.evidence_text
                            : '（无事实证据）'}
                        </div>
                      </div>
                    ) : (
                      <div key={d} className="field" style={{ marginBottom: 6, opacity: 0.5 }}>
                        <div className="field-label">{ABILITY_LABEL[d]}</div>
                        <div className="field-value muted">（本组未评估）</div>
                      </div>
                    ),
                  )}
                </Grid>
              </Card>
            ))
          )}

          <SectionTitle>早期单项评估（CP1 遗留）</SectionTitle>
          <Card desc="早期评估的历史单项记录，作为能力演进的参考；不展示基线/数值等技术字段。">
            {legacy.length === 0 ? (
              <EmptyState title="无早期单项记录" />
            ) : (
              legacy.map((r) => (
                <div key={r.id} className="field" style={{ marginBottom: 8 }}>
                  <div className="field-label">
                    <Tag tone="neutral">早期单项评估</Tag> {ABILITY_LABEL[r.dimension]} · {r.level} {LEVEL_LABEL[r.level]}
                  </div>
                  <div className="field-value muted">
                    {r.evidence_text && r.evidence_text.trim() ? r.evidence_text : '（无附加说明）'}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {' '}
                      · 评估日期 {formatDate(r.assessed_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
