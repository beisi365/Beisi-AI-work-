// ============================================================
// 学员记录字段归一化（纯函数）
// ------------------------------------------------------------
// 目的：students 表是增量演进的（P1 加了档案字段、P2 加了报名问卷字段），
// 云端老行没有新列时读到 undefined。统一在这里补齐默认值，避免每个页面
// 各自写 `?? ''`，防止出现「有的地方显示空、有的地方显示 undefined」。
//
// 由 LocalDataLayer 与 SupabaseDataLayer 共用，改字段只改这一处。
// ============================================================
import type { Student } from '../data/types';

/** 报名问卷结构化字段（对应 Excel 列，可被外部编辑后回写） */
export const SURVEY_FIELDS = [
  'student_no',
  'ai_experience',
  'priority_direction',
  'open_answer',
  'remark',
] as const;

export type SurveyField = (typeof SURVEY_FIELDS)[number];

/**
 * 补齐学员记录的全部可选/新增字段默认值。
 * 已存在的字段原样保留（null 也保留，因为 ai_baseline 等用 null 表示「未填」）。
 */
export function withStudentDefaults<T extends Partial<Student>>(s: T): Student {
  return {
    ...s,
    self_intro: s.self_intro ?? '',
    ai_baseline: s.ai_baseline ?? null,
    teacher_tags: Array.isArray(s.teacher_tags) ? s.teacher_tags : [],
    learning_suggestion: s.learning_suggestion ?? null,
    teacher_observation: s.teacher_observation ?? null,
    archived_at: s.archived_at ?? null,
    student_no: s.student_no ?? '',
    ai_experience: s.ai_experience ?? '',
    priority_direction: s.priority_direction ?? '',
    open_answer: s.open_answer ?? '',
    remark: s.remark ?? '',
  } as Student;
}

/**
 * 显示用学号：优先取外部学号 student_no，缺失时从系统 id 推导（s01 → 01）。
 * 两者都没有时返回空串，UI 自行降级。
 */
export function displayStudentNo(s: Pick<Student, 'student_no' | 'id'>): string {
  const no = (s.student_no ?? '').trim();
  if (no) return no;
  const m = /^[a-zA-Z]*(\d+)$/.exec(s.id ?? '');
  return m ? m[1] : '';
}

/**
 * 学号排序键：把「01」「001」「第3号」等都抽成数字比较，
 * 抽不出数字时返回 Infinity，排在有学号的人之后（避免乱序）。
 */
export function studentNoSortKey(s: Pick<Student, 'student_no' | 'id'>): number {
  const raw = displayStudentNo(s);
  const m = /\d+/.exec(raw);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}
