import { useEffect, useState } from 'react';
import { db } from '../../data/repository';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, Card, Tag, EmptyState, Field, Grid, SectionTitle } from '../../components/ui';
import { ABILITY_LABEL, LEVEL_LABEL, levelToNum } from '../../lib/format';
import type { AbilityAssessment } from '../../data/types';
import {
  ALL_DIMENSIONS,
  getStudentAssessmentView,
  type AssessmentGroupSummary,
} from '../../lib/assessments';

export default function StudentAssessmentsDevPage() {
  const { principal } = useAuth();
  const studentId = principal?.studentId ?? '';
  const [groups, setGroups] = useState<AssessmentGroupSummary[]>([]);
  const [legacy, setLegacy] = useState<AbilityAssessment[]>([]);

  useEffect(() => {
    if (!studentId) return;
    void getStudentAssessmentView(db, studentId).then((v) => {
      setGroups(v.publishedGroups);
      setLegacy(v.legacy);
    });
  }, [studentId]);

  // 学员端硬性约束：仅本人、仅已发布/历史单项；不展示他人姓名、不排名、不展示教师内部 AI 原文
  return (
    <div>
      <PageHeader
        title="我的能力评估"
        desc="仅展示已发布结果与历史评估；草稿、待确认与内部记录不向学生公开。"
      />

      <SectionTitle>已发布评估（按时间倒序）</SectionTitle>
      {groups.length === 0 ? (
        <Card>
          <EmptyState title="暂无已发布评估" hint="教师发布后这里会显示你的能力评估。" />
        </Card>
      ) : (
        groups.map((g) => (
          <Card
            key={g.groupId}
            title={
              <span>
                <Tag tone="success">已发布</Tag>{' '}
                <span className="muted" style={{ fontSize: 12 }}>
                  {new Date(g.createdAt).toLocaleDateString()}
                </span>
              </span>
            }
          >
            <Grid min={220}>
              {ALL_DIMENSIONS.map((d) =>
                g.dims[d] ? (
                  <div key={d} className="field" style={{ marginBottom: 6 }}>
                    <div className="field-label">
                      {ABILITY_LABEL[d]} · {g.dims[d]!.level} {LEVEL_LABEL[g.dims[d]!.level]}
                    </div>
                    <div className="field-value muted">
                      {g.dims[d]!.evidence_text && g.dims[d]!.evidence_text!.trim()
                        ? g.dims[d]!.evidence_text
                        : '（无附加说明）'}
                    </div>
                  </div>
                ) : (
                  <div key={d} className="field" style={{ marginBottom: 6, opacity: 0.5 }}>
                    <div className="field-label">{ABILITY_LABEL[d]}</div>
                    <div className="field-value muted">（未评估）</div>
                  </div>
                ),
              )}
            </Grid>
          </Card>
        ))
      )}

      <SectionTitle>历史评估（单项记录）</SectionTitle>
      <Card desc="来自早期评估的历史单项记录，作为能力演进的参考。">
        {legacy.length === 0 ? (
          <EmptyState title="无历史评估" />
        ) : (
          legacy.map((r) => (
            <Field key={r.id} label={`${ABILITY_LABEL[r.dimension]} · ${r.level} ${LEVEL_LABEL[r.level]}`}>
              <span className="muted">
                来源 {r.source} · 数值 {levelToNum(r.level)}
              </span>
            </Field>
          ))
        )}
      </Card>
    </div>
  );
}
