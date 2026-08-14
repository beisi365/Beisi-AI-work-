import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import {
  PageHeader,
  Card,
  SectionTitle,
  Tag,
  Field,
  Tabs,
  Button,
  LoadingState,
} from '../components/ui';
import { ABILITY_LABEL } from '../lib/format';
import type { Lesson } from '../data/types';

/** 确定性本地模板：仅拼接输入，不调用任何真实模型或网络 */
function buildDemoAdvice(input: string): string {
  const goal = input.trim() || '（未填写目标）';
  return `演示版 AI 建议（仅用于流程测试）：针对你的目标「${goal}」，建议先明确需求，再编写分步提示词，最后用工具生成并核对。`;
}

type TabKey = 'lecture' | 'steps' | 'homework';

export default function PracticeRoomPage() {
  const { lessonId } = useParams();
  const { principal } = useAuth();
  const navigate = useNavigate();
  const prefix = principal?.role === 'student' ? '/s' : '/t';
  const isStudent = principal?.role === 'student';

  const [tab, setTab] = useState<TabKey>('lecture');
  const [goal, setGoal] = useState('');
  const [advice, setAdvice] = useState('');

  const { data: lesson, loading } = useRepository(['lessons'], async (db) => {
    if (!lessonId) return null;
    return db.lessons.get(lessonId);
  });

  if (loading) return <LoadingState />;
  if (!lesson) {
    return (
      <div>
        <PageHeader
          title="AI 实操教室"
          actions={<Button onClick={() => navigate(`${prefix}/course-map`)}>返回课程地图</Button>}
        />
        <p className="muted">未找到对应课次。</p>
      </div>
    );
  }

  const onGenerate = () => setAdvice(buildDemoAdvice(goal));
  const l = lesson as Lesson;

  return (
    <div>
      <PageHeader
        title={`AI 实操教室 · ${l.title}`}
        desc={`第 ${l.seq} 节 · ${ABILITY_LABEL[l.ability_dimension]}${l.est_time ? ` · 预计 ${l.est_time}` : ''}`}
        actions={<Button onClick={() => navigate(`${prefix}/course-map`)}>返回课程地图</Button>}
      />

      <Card>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
          <Tag tone="accent">{ABILITY_LABEL[l.ability_dimension]}</Tag>
          <Tag tone="neutral">第 {l.seq} 节</Tag>
          {l.est_time && <Tag tone="neutral">预计 {l.est_time}</Tag>}
          {l.tools && <Tag tone="neutral">工具：{l.tools}</Tag>}
        </div>

        <Tabs<TabKey>
          items={[
            { key: 'lecture', label: '讲解' },
            { key: 'steps', label: '实操步骤' },
            { key: 'homework', label: '作业与标准' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ marginTop: 'var(--sp-4)' }}>
          {tab === 'lecture' && (
            <>
              <Field label="学习目标">{l.objectives || '—'}</Field>
              <Field label="前置要求">{l.prereq || '—'}</Field>
              <Field label="讲解内容">{l.content || '—'}</Field>
              <Field label="常见问题">{l.faq || '—'}</Field>
            </>
          )}
          {tab === 'steps' && (
            <>
              <Field label="实操步骤">{l.steps || '—'}</Field>
              <Field label="课堂练习">{l.exercise || '—'}</Field>
            </>
          )}
          {tab === 'homework' && (
            <>
              <Field label="课后作业">{l.homework || '—'}</Field>
              <Field label="完成标准">{l.completion_criteria || '—'}</Field>
            </>
          )}
        </div>
      </Card>

      <SectionTitle>AI 实操教室（演示版）</SectionTitle>
      <Card desc="本地模拟生成器，不连接任何外部模型或服务">
        <div className="form-row">
          <label>你的练习目标</label>
          <textarea
            className="textarea"
            value={goal}
            placeholder="例如：用 AI 把一段产品介绍改写成短视频脚本"
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>
        <Button variant="primary" onClick={onGenerate}>
          生成演示建议
        </Button>

        {advice && (
          <div className="ai-note" style={{ marginTop: 'var(--sp-3)' }}>
            <strong>演示版 AI 建议，仅用于流程测试，非真实模型输出</strong>
            <p style={{ margin: '6px 0 0' }}>{advice}</p>
          </div>
        )}

        <div className="ai-note" style={{ marginTop: 'var(--sp-3)' }}>
          <strong>演示版 AI 建议，仅用于流程测试，非真实模型输出。</strong>
          本区块为前端本地确定性模板，不会调用任何真实 AI 接口或外部网络。
        </div>
      </Card>

      {isStudent && (
        <Card title="学员入口" desc="提交本课作业 / 查看学习提示">
          <Field label="作业提交">
            <Button variant="primary" onClick={() => navigate('/s/works')}>
              前往作业提交
            </Button>
          </Field>
          <Field label="学习困难提示">
            若本课练习遇到问题，可在作业提交页附上问题，教师会结合「高频学习困难排行」重点跟进。
          </Field>
        </Card>
      )}
    </div>
  );
}
