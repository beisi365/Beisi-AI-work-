import { describe, expect, it } from 'vitest';
import { aiLevelBucket, AI_LEVEL_META } from '../src/components/StudentAiLevelPanel';
import type { Student } from '../src/data/types';

const make = (overrides: Partial<Student> = {}): Student =>
  ({
    ai_experience: '',
    priority_direction: '',
    teacher_tags: [],
    ...overrides,
  } as Student);

describe('aiLevelBucket', () => {
  it('「待补资料」标签优先于其它判定', () => {
    expect(
      aiLevelBucket(make({ teacher_tags: ['待补资料'], ai_experience: '经常使用' })),
    ).toBe('pending');
  });

  it('经常使用 + 有明确优先方向 → 高级', () => {
    expect(
      aiLevelBucket(make({ ai_experience: '经常使用 ChatGPT、文心一言', priority_direction: 'AI办公&文案' })),
    ).toBe('high');
  });

  it('经常使用但无优先方向 → 仍归中级（保守，避免误判高级）', () => {
    expect(aiLevelBucket(make({ ai_experience: '经常使用' }))).toBe('mid');
  });

  it('偶尔用过几次 → 中级', () => {
    expect(aiLevelBucket(make({ ai_experience: '偶尔用过几次' }))).toBe('mid');
  });

  it('只是听说 / 基础 / 接触过 → 中级', () => {
    expect(aiLevelBucket(make({ ai_experience: '只是听说' }))).toBe('mid');
    expect(aiLevelBucket(make({ ai_experience: '基础了解' }))).toBe('mid');
    expect(aiLevelBucket(make({ ai_experience: '接触过一点' }))).toBe('mid');
    expect(aiLevelBucket(make({ ai_experience: '试过几次' }))).toBe('mid');
  });

  it('未使用 / 没用过 / 空 → 初级', () => {
    expect(aiLevelBucket(make({ ai_experience: '未使用' }))).toBe('low');
    expect(aiLevelBucket(make({ ai_experience: '没用过' }))).toBe('low');
    expect(aiLevelBucket(make({ ai_experience: '' }))).toBe('low');
  });

  it('深度使用 + 熟练 → 高级', () => {
    expect(
      aiLevelBucket(make({ ai_experience: '深度使用', priority_direction: 'AI智能体' })),
    ).toBe('high');
    expect(
      aiLevelBucket(make({ ai_experience: '熟练日常使用', priority_direction: 'AI绘画' })),
    ).toBe('high');
  });

  it('AI_LEVEL_META 覆盖 4 个等级', () => {
    expect(Object.keys(AI_LEVEL_META).sort()).toEqual(['high', 'low', 'mid', 'pending']);
  });
});