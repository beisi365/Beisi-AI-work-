import { useCallback, useEffect, useState } from 'react';
import { db } from '../../data/repository';
import { useAuth } from '../../auth/AuthContext';
import { useRepository } from '../../hooks/useRepository';
import { PageHeader, Card, Button, Tag, EmptyState, Field, Grid, SectionTitle } from '../../components/ui';
import { ABILITY_LABEL, LEVEL_LABEL, levelToNum } from '../../lib/format';
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

function DimRow({ dim, level, evidence }: { dim: AbilityDimension; level: AbilityLevel; evidence: string | null }) {
  return (
    <div className="field" style={{ marginBottom: 6 }}>
      <div className="field-label">
        {ABILITY_LABEL[dim]} · {level} {LEVEL_LABEL[level]}
      </div>
      <div className="field-value muted">{evidence && evidence.trim() ? evidence : '（无事实证据）'}</div>
    </div>
  );
}

export default function AssessmentsDevPage() {
  const { principal } = useAuth();
  const students = useRepository(['students'], (d) => d.students.list());
  const [studentId, setStudentId] = useState('');
  const [groups, setGroups] = useState<AssessmentGroupSummary[]>([]);
  const [legacy, setLegacy] = useState<AbilityAssessment[]>([]);
  const [form, setForm] = useState<Record<AbilityDimension, { level: AbilityLevel; evidence_text: string }>>(() =>
    Object.fromEntries(
      ALL_DIMENSIONS.map((d) => [d, { level: 'L2' as AbilityLevel, evidence_text: '' }]),
    ) as Record<AbilityDimension, { level: AbilityLevel; evidence_text: string }>,
  );
  const [busy, setBusy] = useState(false);

  // 默认选中第一个学员
  useEffect(() => {
    if (!studentId && students.data && students.data.length) {
      setStudentId(students.data[0].id);
    }
  }, [students.data, studentId]);

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

  const canConfirm = (g: AssessmentGroupSummary) =>
    g.status === 'draft' &&
    ALL_DIMENSIONS.every((d) => g.dims[d]) &&
    ALL_DIMENSIONS.every((d) => isEvidenceComplete(g.dims[d] ?? {}));

  const studentName = (id: string) => students.data?.find((s) => s.id === id)?.nickname ?? id;

  return (
    <div>
      <PageHeader
        title="能力评估 · 内部开发页（CP2.1）"
        desc="仅开发环境可见，不进入正式导航。演示整组原子流转：草稿 → 确认 → 发布 → 修正（旧组作废）。"
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
          <Card title="新建评估组（草稿）" desc="六维共用一组 ID；draft 允许维度未完成，确认前须六维齐全且每维有事实证据。">
            <Grid min={220}>
              {ALL_DIMENSIONS.map((d) => (
                <div key={d} className="card" style={{ padding: 12 }}>
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    {ABILITY_LABEL[d]}
                  </div>
                  <select
                    className="select"
                    value={form[d].level}
                    onChange={(e) => setForm((f) => ({ ...f, [d]: { ...f[d], level: e.target.value as AbilityLevel } }))}
                  >
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
                    value={form[d].evidence_text}
                    onChange={(e) => setForm((f) => ({ ...f, [d]: { ...f[d], evidence_text: e.target.value } }))}
                  />
                </div>
              ))}
            </Grid>
            <div className="row" style={{ marginTop: 12 }}>
              <Button variant="primary" size="sm" disabled={busy} onClick={saveDraft}>
                保存为草稿
              </Button>
            </div>
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
                      {g.groupId}
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
                      <DimRow key={d} dim={d} level={g.dims[d]!.level} evidence={g.dims[d]!.evidence_text} />
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

          <SectionTitle>历史单项记录（CP1 遗留 · 未分组）</SectionTitle>
          <Card desc="遗留数据继续保持参与 CP1 能力摘要与单维历史，不按时间戳伪造分组。">
            {legacy.length === 0 ? (
              <EmptyState title="无遗留单项记录" />
            ) : (
              legacy.map((r) => (
                <Field key={r.id} label={`${ABILITY_LABEL[r.dimension]} · ${r.level} ${LEVEL_LABEL[r.level]}`}>
                  <span className="muted">
                    来源 {r.source} · 数值 {levelToNum(r.level)} · 学员 {studentName(r.student_id)}
                  </span>
                </Field>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
