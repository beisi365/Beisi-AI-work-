import { useEffect, useState } from 'react';
import { db } from '../../data/repository';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, Card, Tag, EmptyState, Grid, SectionTitle } from '../../components/ui';
import { ABILITY_LABEL, LEVEL_LABEL, formatDate } from '../../lib/format';
import type { AbilityAssessment, AbilityLevel } from '../../data/types';
import {
  getStudentComparison,
  type StudentComparison,
  type AbilityCardDim,
} from '../../lib/assessments';

function changeBadge(change: number | null): { text: string; tone: 'success' | 'danger' | 'neutral' } {
  if (change == null) return { text: '新基线', tone: 'neutral' };
  if (change > 0) return { text: `提升 ${change} 级`, tone: 'success' };
  if (change < 0) return { text: `下降 ${Math.abs(change)} 级`, tone: 'danger' };
  return { text: '持平', tone: 'neutral' };
}

function levelText(l: AbilityLevel | null): string {
  if (!l) return '待评估';
  return `${l} ${LEVEL_LABEL[l]}`;
}

// 学员端能力评估核心组件：正式入口与开发隐藏路由共用，避免两套业务逻辑。
export function StudentAssessmentViewer() {
  const { principal } = useAuth();
  const studentId = principal?.studentId ?? '';
  const [cmp, setCmp] = useState<StudentComparison | null>(null);
  const [legacy, setLegacy] = useState<AbilityAssessment[]>([]);

  useEffect(() => {
    if (!studentId) return;
    void getStudentComparison(db, studentId).then((v) => {
      setCmp(v);
      setLegacy(v.legacy);
    });
  }, [studentId]);

  // 学员端硬性约束：仅本人、仅已发布/历史单项；不展示他人姓名、不排名、不展示教师内部 AI 原文
  const up = cmp ? cmp.cards.filter((c) => c.change != null && c.change > 0).length : 0;
  const down = cmp ? cmp.cards.filter((c) => c.change != null && c.change < 0).length : 0;
  const flat = cmp ? cmp.cards.filter((c) => c.change != null && c.change === 0).length : 0;

  return (
    <div>
      <PageHeader
        title="我的能力评估"
        desc="这里展示老师已确认发布的能力评估与成长记录。"
      />

      <SectionTitle>能力总览（六维）</SectionTitle>
      {!cmp || cmp.currentGroup == null ? (
        <Card>
          <EmptyState
            title="暂无已发布评估"
            hint="老师发布后这里会显示你的六维能力卡与成长对比；早期单项评估见下方。"
          />
        </Card>
      ) : (
        <>
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Tag tone="success">提升 {up} 维</Tag>
            <Tag tone="danger">下降 {down} 维</Tag>
            <Tag tone="neutral">持平 {flat} 维</Tag>
            <span className="muted" style={{ fontSize: 13 }}>
              与上一版本对比（仅本人最近两次评估）
            </span>
          </div>
          <Grid min={300}>
            {cmp.cards.map((c: AbilityCardDim) => {
              const badge = changeBadge(c.change);
              return (
                <div key={c.dimension} className="card" style={{ padding: 14 }}>
                  <div className="field-label" style={{ marginBottom: 8 }}>
                    {ABILITY_LABEL[c.dimension]}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{levelText(c.currentLevel)}</div>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    上次：{levelText(c.previousLevel)} ·{' '}
                    <span className={`tag tag--${badge.tone}`}>{badge.text}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    评估日期：{c.date ? formatDate(c.date) : '—'}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    证据：{c.evidence && c.evidence.trim() ? c.evidence : '—'}
                  </div>
                </div>
              );
            })}
          </Grid>
        </>
      )}

      <SectionTitle>早期单项评估（CP1 遗留）</SectionTitle>
      <Card desc="来自早期评估的历史单项记录，作为能力演进的参考；不展示基线/数值等技术字段。">
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
    </div>
  );
}
